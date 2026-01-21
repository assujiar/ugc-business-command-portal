-- ============================================
-- Migration: 050_customer_quotations_system.sql
-- Customer Quotations System for sending quotes to end customers
-- ============================================

-- ============================================
-- UPDATE ENUMS
-- ============================================

-- Add quote_sent_to_customer to ticket_event_type if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'quote_sent_to_customer' AND enumtypid = 'ticket_event_type'::regtype) THEN
        ALTER TYPE ticket_event_type ADD VALUE 'quote_sent_to_customer';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'customer_quotation_created' AND enumtypid = 'ticket_event_type'::regtype) THEN
        ALTER TYPE ticket_event_type ADD VALUE 'customer_quotation_created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'customer_quotation_sent' AND enumtypid = 'ticket_event_type'::regtype) THEN
        ALTER TYPE ticket_event_type ADD VALUE 'customer_quotation_sent';
    END IF;
END$$;

-- Rate structure type (bundling or breakdown)
CREATE TYPE rate_structure_type AS ENUM ('bundling', 'breakdown');

-- Customer quotation status
CREATE TYPE customer_quotation_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');

-- Rate component types for logistics industry
CREATE TYPE rate_component_type AS ENUM (
    -- Freight & Transportation
    'freight_charge',
    'trucking_origin',
    'trucking_destination',
    'sea_freight',
    'air_freight',
    'rail_freight',
    'barge_freight',
    'interisland_freight',

    -- Port & Terminal Charges
    'thc_origin',
    'thc_destination',
    'terminal_handling',
    'wharfage',
    'port_charges',
    'container_seal',

    -- Customs & Documentation
    'customs_clearance',
    'customs_broker_fee',
    'import_duty',
    'vat_ppn',
    'pph_import',
    'quarantine_fee',
    'fumigation',
    'certificate_of_origin',
    'legalization_fee',

    -- Handling & Storage
    'handling_charge',
    'loading_unloading',
    'forklift_charge',
    'warehouse_storage',
    'stuffing_unstuffing',
    'palletization',
    'wrapping_packing',
    'labeling',

    -- Insurance & Security
    'cargo_insurance',
    'marine_insurance',
    'security_charge',

    -- Container & Equipment
    'container_rental',
    'container_cleaning',
    'container_repair',
    'demurrage',
    'detention',
    'reefer_plug_in',

    -- Documentation & Admin
    'documentation_fee',
    'bill_of_lading_fee',
    'telex_release',
    'manifest_fee',
    'admin_fee',
    'communication_fee',

    -- Special Services
    'dangerous_goods_surcharge',
    'overweight_surcharge',
    'oversized_surcharge',
    'lift_on_lift_off',
    'surveyor_fee',
    'sampling_fee',
    'inspection_fee',

    -- Surcharges
    'fuel_surcharge',
    'currency_adjustment_factor',
    'peak_season_surcharge',
    'congestion_surcharge',
    'low_sulphur_surcharge',
    'war_risk_surcharge',
    'piracy_surcharge',

    -- Other
    'other'
);

-- ============================================
-- CUSTOMER QUOTATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.customer_quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference to ticket
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    operational_cost_id UUID REFERENCES public.ticket_rate_quotes(id) ON DELETE SET NULL,

    -- Quotation identification
    quotation_number VARCHAR(50) UNIQUE NOT NULL,

    -- Customer info (can be different from ticket contact)
    customer_name VARCHAR(255) NOT NULL,
    customer_company VARCHAR(255),
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    customer_address TEXT,

    -- Service details (copied/edited from ticket)
    service_type VARCHAR(100),
    service_type_code VARCHAR(20),
    fleet_type VARCHAR(100),
    fleet_quantity INTEGER,
    incoterm VARCHAR(20),
    commodity VARCHAR(255),
    cargo_description TEXT,
    cargo_weight DECIMAL(15,2),
    cargo_weight_unit VARCHAR(10) DEFAULT 'kg',
    cargo_volume DECIMAL(15,2),
    cargo_volume_unit VARCHAR(10) DEFAULT 'cbm',
    cargo_quantity INTEGER,
    cargo_quantity_unit VARCHAR(50),

    -- Origin & Destination
    origin_address TEXT,
    origin_city VARCHAR(100),
    origin_country VARCHAR(100),
    origin_port VARCHAR(100),
    destination_address TEXT,
    destination_city VARCHAR(100),
    destination_country VARCHAR(100),
    destination_port VARCHAR(100),

    -- Rate structure
    rate_structure rate_structure_type NOT NULL DEFAULT 'bundling',

    -- For bundling mode
    total_cost DECIMAL(15,2),
    target_margin_percent DECIMAL(5,2),
    total_selling_rate DECIMAL(15,2),

    -- Currency
    currency VARCHAR(3) DEFAULT 'IDR',

    -- Scope of work
    scope_of_work TEXT,

    -- Terms & Conditions stored as JSONB
    terms_includes JSONB DEFAULT '[]',
    terms_excludes JSONB DEFAULT '[]',
    terms_notes TEXT,

    -- Validity
    validity_days INTEGER DEFAULT 14,
    valid_until DATE,

    -- Status & tracking
    status customer_quotation_status DEFAULT 'draft',
    pdf_url TEXT,
    pdf_generated_at TIMESTAMPTZ,
    sent_via VARCHAR(20), -- 'email', 'whatsapp', 'manual'
    sent_at TIMESTAMPTZ,
    sent_to VARCHAR(255),

    -- QR Code validation
    validation_code UUID DEFAULT gen_random_uuid(),

    -- Metadata
    created_by UUID NOT NULL REFERENCES public.profiles(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_customer_quotations_ticket ON public.customer_quotations(ticket_id);
CREATE INDEX idx_customer_quotations_status ON public.customer_quotations(status);
CREATE INDEX idx_customer_quotations_validation ON public.customer_quotations(validation_code);
CREATE INDEX idx_customer_quotations_number ON public.customer_quotations(quotation_number);

-- ============================================
-- CUSTOMER QUOTATION ITEMS (for breakdown mode)
-- ============================================

CREATE TABLE IF NOT EXISTS public.customer_quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.customer_quotations(id) ON DELETE CASCADE,

    -- Component details
    component_type rate_component_type NOT NULL,
    component_name VARCHAR(255), -- Custom name if type is 'other'
    description TEXT,

    -- Pricing
    cost_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    target_margin_percent DECIMAL(5,2) DEFAULT 0,
    selling_rate DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Unit pricing (optional)
    unit_price DECIMAL(15,2),
    quantity DECIMAL(10,2),
    unit VARCHAR(50),

    -- Order
    sort_order INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotation_items_quotation ON public.customer_quotation_items(quotation_id);

-- ============================================
-- QUOTATION SEQUENCE FOR NUMBER GENERATION
-- ============================================

CREATE TABLE IF NOT EXISTS public.customer_quotation_sequences (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    last_sequence INTEGER DEFAULT 0,
    PRIMARY KEY (year, month)
);

-- ============================================
-- FUNCTION: Generate Quotation Number
-- Format: QUO-YYYYMM-XXXX
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_customer_quotation_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year INTEGER;
    v_month INTEGER;
    v_seq INTEGER;
    v_number VARCHAR(50);
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    v_month := EXTRACT(MONTH FROM CURRENT_DATE);

    -- Get or create sequence
    INSERT INTO public.customer_quotation_sequences (year, month, last_sequence)
    VALUES (v_year, v_month, 1)
    ON CONFLICT (year, month)
    DO UPDATE SET last_sequence = customer_quotation_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_seq;

    -- Format: QUO-YYYYMM-XXXX
    v_number := 'QUO-' || v_year::TEXT || LPAD(v_month::TEXT, 2, '0') || '-' || LPAD(v_seq::TEXT, 4, '0');

    RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DEFAULT TERMS & CONDITIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.quotation_term_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term_type VARCHAR(20) NOT NULL CHECK (term_type IN ('include', 'exclude')),
    term_text TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default include terms
INSERT INTO public.quotation_term_templates (term_type, term_text, is_default, sort_order) VALUES
-- Includes
('include', 'Door to door delivery service', true, 1),
('include', 'Pickup from origin address', true, 2),
('include', 'Delivery to destination address', true, 3),
('include', 'Standard packaging', true, 4),
('include', 'Cargo insurance coverage', false, 5),
('include', 'Customs clearance handling', false, 6),
('include', 'Documentation processing', true, 7),
('include', 'Real-time tracking', true, 8),
('include', 'Loading and unloading service', false, 9),
('include', 'Warehouse handling', false, 10),
('include', 'Container seal', false, 11),
('include', 'Bill of Lading issuance', false, 12),
-- Excludes
('exclude', 'Import duties and taxes', true, 1),
('exclude', 'Storage charges beyond free days', true, 2),
('exclude', 'Demurrage and detention charges', true, 3),
('exclude', 'Re-delivery charges', true, 4),
('exclude', 'Additional handling for fragile items', false, 5),
('exclude', 'Special equipment requirements', false, 6),
('exclude', 'Overtime charges for weekend/holiday delivery', false, 7),
('exclude', 'Insurance claims processing', false, 8),
('exclude', 'Fumigation costs', false, 9),
('exclude', 'Quarantine inspection fees', false, 10),
('exclude', 'Certificate of origin', false, 11),
('exclude', 'Legalization fees', false, 12);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE public.customer_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_term_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_quotation_sequences ENABLE ROW LEVEL SECURITY;

-- Customer Quotations Policies
CREATE POLICY "customer_quotations_select" ON public.customer_quotations
    FOR SELECT TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (
            created_by = auth.uid()
            OR public.is_ticketing_admin(auth.uid())
            OR EXISTS (
                SELECT 1 FROM public.tickets t
                WHERE t.id = ticket_id
                AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
            )
        )
    );

CREATE POLICY "customer_quotations_insert" ON public.customer_quotations
    FOR INSERT TO authenticated
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND created_by = auth.uid()
    );

CREATE POLICY "customer_quotations_update" ON public.customer_quotations
    FOR UPDATE TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (created_by = auth.uid() OR public.is_ticketing_admin(auth.uid()))
    );

CREATE POLICY "customer_quotations_delete" ON public.customer_quotations
    FOR DELETE TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (created_by = auth.uid() OR public.is_ticketing_admin(auth.uid()))
        AND status = 'draft'
    );

-- Customer Quotation Items Policies
CREATE POLICY "quotation_items_select" ON public.customer_quotation_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.customer_quotations q
            WHERE q.id = quotation_id
            AND (
                q.created_by = auth.uid()
                OR public.is_ticketing_admin(auth.uid())
            )
        )
    );

CREATE POLICY "quotation_items_insert" ON public.customer_quotation_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.customer_quotations q
            WHERE q.id = quotation_id
            AND (q.created_by = auth.uid() OR public.is_ticketing_admin(auth.uid()))
        )
    );

CREATE POLICY "quotation_items_update" ON public.customer_quotation_items
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.customer_quotations q
            WHERE q.id = quotation_id
            AND (q.created_by = auth.uid() OR public.is_ticketing_admin(auth.uid()))
        )
    );

CREATE POLICY "quotation_items_delete" ON public.customer_quotation_items
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.customer_quotations q
            WHERE q.id = quotation_id
            AND (q.created_by = auth.uid() OR public.is_ticketing_admin(auth.uid()))
        )
    );

-- Term Templates - read for all ticketing users
CREATE POLICY "term_templates_select" ON public.quotation_term_templates
    FOR SELECT TO authenticated
    USING (public.can_access_ticketing(auth.uid()) AND is_active = TRUE);

-- Sequences - system use
CREATE POLICY "quotation_sequences_all" ON public.customer_quotation_sequences
    FOR ALL TO authenticated
    USING (public.can_access_ticketing(auth.uid()));

-- ============================================
-- RPC: CREATE CUSTOMER QUOTATION
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_create_customer_quotation(
    p_ticket_id UUID,
    p_operational_cost_id UUID DEFAULT NULL,
    p_customer_data JSONB DEFAULT '{}',
    p_service_data JSONB DEFAULT '{}',
    p_rate_data JSONB DEFAULT '{}',
    p_terms_data JSONB DEFAULT '{}',
    p_items JSONB DEFAULT '[]'
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_quotation_number VARCHAR(50);
    v_quotation_id UUID;
    v_valid_until DATE;
    v_item JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Generate quotation number
    v_quotation_number := public.generate_customer_quotation_number();

    -- Calculate valid_until
    v_valid_until := CURRENT_DATE + (COALESCE((p_terms_data->>'validity_days')::INTEGER, 14))::INTEGER;

    -- Insert quotation
    INSERT INTO public.customer_quotations (
        ticket_id,
        operational_cost_id,
        quotation_number,
        customer_name,
        customer_company,
        customer_email,
        customer_phone,
        customer_address,
        service_type,
        service_type_code,
        fleet_type,
        fleet_quantity,
        incoterm,
        commodity,
        cargo_description,
        cargo_weight,
        cargo_weight_unit,
        cargo_volume,
        cargo_volume_unit,
        cargo_quantity,
        cargo_quantity_unit,
        origin_address,
        origin_city,
        origin_country,
        origin_port,
        destination_address,
        destination_city,
        destination_country,
        destination_port,
        rate_structure,
        total_cost,
        target_margin_percent,
        total_selling_rate,
        currency,
        scope_of_work,
        terms_includes,
        terms_excludes,
        terms_notes,
        validity_days,
        valid_until,
        created_by
    ) VALUES (
        p_ticket_id,
        p_operational_cost_id,
        v_quotation_number,
        COALESCE(p_customer_data->>'customer_name', ''),
        p_customer_data->>'customer_company',
        p_customer_data->>'customer_email',
        p_customer_data->>'customer_phone',
        p_customer_data->>'customer_address',
        p_service_data->>'service_type',
        p_service_data->>'service_type_code',
        p_service_data->>'fleet_type',
        (p_service_data->>'fleet_quantity')::INTEGER,
        p_service_data->>'incoterm',
        p_service_data->>'commodity',
        p_service_data->>'cargo_description',
        (p_service_data->>'cargo_weight')::DECIMAL,
        COALESCE(p_service_data->>'cargo_weight_unit', 'kg'),
        (p_service_data->>'cargo_volume')::DECIMAL,
        COALESCE(p_service_data->>'cargo_volume_unit', 'cbm'),
        (p_service_data->>'cargo_quantity')::INTEGER,
        p_service_data->>'cargo_quantity_unit',
        p_service_data->>'origin_address',
        p_service_data->>'origin_city',
        p_service_data->>'origin_country',
        p_service_data->>'origin_port',
        p_service_data->>'destination_address',
        p_service_data->>'destination_city',
        p_service_data->>'destination_country',
        p_service_data->>'destination_port',
        COALESCE(p_rate_data->>'rate_structure', 'bundling')::rate_structure_type,
        (p_rate_data->>'total_cost')::DECIMAL,
        (p_rate_data->>'target_margin_percent')::DECIMAL,
        (p_rate_data->>'total_selling_rate')::DECIMAL,
        COALESCE(p_rate_data->>'currency', 'IDR'),
        p_terms_data->>'scope_of_work',
        COALESCE(p_terms_data->'terms_includes', '[]'::JSONB),
        COALESCE(p_terms_data->'terms_excludes', '[]'::JSONB),
        p_terms_data->>'terms_notes',
        COALESCE((p_terms_data->>'validity_days')::INTEGER, 14),
        v_valid_until,
        v_user_id
    ) RETURNING id INTO v_quotation_id;

    -- Insert breakdown items if any
    IF jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            INSERT INTO public.customer_quotation_items (
                quotation_id,
                component_type,
                component_name,
                description,
                cost_amount,
                target_margin_percent,
                selling_rate,
                unit_price,
                quantity,
                unit,
                sort_order
            ) VALUES (
                v_quotation_id,
                (v_item->>'component_type')::rate_component_type,
                v_item->>'component_name',
                v_item->>'description',
                COALESCE((v_item->>'cost_amount')::DECIMAL, 0),
                COALESCE((v_item->>'target_margin_percent')::DECIMAL, 0),
                COALESCE((v_item->>'selling_rate')::DECIMAL, 0),
                (v_item->>'unit_price')::DECIMAL,
                (v_item->>'quantity')::DECIMAL,
                v_item->>'unit',
                COALESCE((v_item->>'sort_order')::INTEGER, 0)
            );
        END LOOP;
    END IF;

    -- Create ticket event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'customer_quotation_created',
        v_user_id,
        jsonb_build_object(
            'quotation_id', v_quotation_id,
            'quotation_number', v_quotation_number
        ),
        'Customer quotation created'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation_id,
        'quotation_number', v_quotation_number
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RPC: UPDATE QUOTATION STATUS
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_update_quotation_status(
    p_quotation_id UUID,
    p_status customer_quotation_status,
    p_sent_via VARCHAR DEFAULT NULL,
    p_sent_to VARCHAR DEFAULT NULL,
    p_pdf_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_quotation public.customer_quotations;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RAISE EXCEPTION 'Quotation not found';
    END IF;

    -- Check permission
    IF v_quotation.created_by != v_user_id AND NOT public.is_ticketing_admin(v_user_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Update quotation
    UPDATE public.customer_quotations
    SET
        status = p_status,
        sent_via = COALESCE(p_sent_via, sent_via),
        sent_to = COALESCE(p_sent_to, sent_to),
        sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE sent_at END,
        pdf_url = COALESCE(p_pdf_url, pdf_url),
        pdf_generated_at = CASE WHEN p_pdf_url IS NOT NULL THEN NOW() ELSE pdf_generated_at END,
        updated_at = NOW()
    WHERE id = p_quotation_id;

    -- Create ticket event if sent
    IF p_status = 'sent' THEN
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            new_value,
            notes
        ) VALUES (
            v_quotation.ticket_id,
            'customer_quotation_sent',
            v_user_id,
            jsonb_build_object(
                'quotation_id', p_quotation_id,
                'quotation_number', v_quotation.quotation_number,
                'sent_via', p_sent_via,
                'sent_to', p_sent_to
            ),
            'Customer quotation sent via ' || COALESCE(p_sent_via, 'manual')
        );

        -- Also update ticket status to pending
        UPDATE public.tickets
        SET
            status = 'pending',
            pending_response_from = 'creator',
            updated_at = NOW()
        WHERE id = v_quotation.ticket_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.generate_customer_quotation_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_customer_quotation(UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_quotation_status(UUID, customer_quotation_status, VARCHAR, VARCHAR, TEXT) TO authenticated;
