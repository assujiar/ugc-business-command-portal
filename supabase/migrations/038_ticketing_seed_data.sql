-- ============================================
-- Ticketing Module - Seed Data for Testing
-- Part of UGC Business Command Portal Integration
-- Only run in development/testing environments
-- ============================================

-- Note: This seed data assumes there are existing users in the profiles table
-- and accounts in the accounts table. Adjust UUIDs as needed for your environment.

-- For testing, we'll check if profiles exist before inserting seed data
DO $$
DECLARE
    v_first_user_id UUID;
    v_second_user_id UUID;
    v_first_account_id TEXT;
    v_ticket_id_1 UUID;
    v_ticket_id_2 UUID;
    v_ticket_id_3 UUID;
    v_ticket_id_4 UUID;
    v_ticket_id_5 UUID;
BEGIN
    -- Get first two active users (preferably ops or sales roles)
    SELECT user_id INTO v_first_user_id
    FROM public.profiles
    WHERE is_active = TRUE
    ORDER BY created_at
    LIMIT 1;

    SELECT user_id INTO v_second_user_id
    FROM public.profiles
    WHERE is_active = TRUE AND user_id != v_first_user_id
    ORDER BY created_at
    LIMIT 1;

    -- Get first account
    SELECT account_id INTO v_first_account_id
    FROM public.accounts
    ORDER BY created_at
    LIMIT 1;

    -- Only proceed if we have users
    IF v_first_user_id IS NOT NULL THEN
        RAISE NOTICE 'Seeding ticketing data with user_id: %', v_first_user_id;

        -- Generate UUIDs for tickets
        v_ticket_id_1 := gen_random_uuid();
        v_ticket_id_2 := gen_random_uuid();
        v_ticket_id_3 := gen_random_uuid();
        v_ticket_id_4 := gen_random_uuid();
        v_ticket_id_5 := gen_random_uuid();

        -- Insert sample tickets (skip if tickets already exist to prevent duplicates)
        IF NOT EXISTS (SELECT 1 FROM public.tickets LIMIT 1) THEN

            -- Ticket 1: RFQ - Open, Domestics
            INSERT INTO public.tickets (
                id, ticket_code, ticket_type, subject, description, department,
                created_by, priority, status, account_id,
                rfq_data
            ) VALUES (
                v_ticket_id_1,
                'RFQDOM' || TO_CHAR(CURRENT_DATE, 'DDMMYY') || '001',
                'RFQ',
                'Rate Quote Request - LTL Jakarta to Surabaya',
                'Need rate quote for regular LTL shipment from Jakarta to Surabaya. Approximately 2 CBM per week.',
                'DOM',
                v_first_user_id,
                'high',
                'open',
                v_first_account_id,
                jsonb_build_object(
                    'service_type', 'LTL',
                    'cargo_category', 'Genco',
                    'cargo_description', 'Electronics Components',
                    'origin_city', 'Jakarta',
                    'origin_country', 'Indonesia',
                    'destination_city', 'Surabaya',
                    'destination_country', 'Indonesia',
                    'quantity', 10,
                    'unit_of_measure', 'Boxes',
                    'weight_per_unit', 25,
                    'length', 60,
                    'width', 40,
                    'height', 40,
                    'volume_per_unit', 0.096,
                    'total_volume', 0.96
                )
            );

            -- Insert SLA tracking for ticket 1
            INSERT INTO public.ticket_sla_tracking (
                ticket_id, first_response_sla_hours, resolution_sla_hours
            ) VALUES (v_ticket_id_1, 4, 48);

            -- Insert event for ticket 1
            INSERT INTO public.ticket_events (
                ticket_id, event_type, actor_user_id, new_value, notes
            ) VALUES (
                v_ticket_id_1, 'created', v_first_user_id,
                jsonb_build_object('ticket_code', 'RFQDOM' || TO_CHAR(CURRENT_DATE, 'DDMMYY') || '001'),
                'Ticket created'
            );

            -- Ticket 2: GEN - In Progress, Sales (assigned)
            INSERT INTO public.tickets (
                id, ticket_code, ticket_type, subject, description, department,
                created_by, assigned_to, priority, status, account_id,
                first_response_at
            ) VALUES (
                v_ticket_id_2,
                'GENSAL' || TO_CHAR(CURRENT_DATE, 'DDMMYY') || '001',
                'GEN',
                'Inquiry about warehousing services',
                'Customer is asking about our warehousing capabilities in Cibitung. Need temperature controlled storage.',
                'SAL',
                v_first_user_id,
                COALESCE(v_second_user_id, v_first_user_id),
                'medium',
                'in_progress',
                v_first_account_id,
                NOW() - INTERVAL '2 hours'
            );

            -- Insert SLA tracking for ticket 2
            INSERT INTO public.ticket_sla_tracking (
                ticket_id, first_response_sla_hours, resolution_sla_hours,
                first_response_at, first_response_met
            ) VALUES (
                v_ticket_id_2, 4, 24,
                NOW() - INTERVAL '2 hours', TRUE
            );

            -- Insert events for ticket 2
            INSERT INTO public.ticket_events (
                ticket_id, event_type, actor_user_id, new_value, notes, created_at
            ) VALUES
            (
                v_ticket_id_2, 'created', v_first_user_id,
                jsonb_build_object('ticket_code', 'GENSAL' || TO_CHAR(CURRENT_DATE, 'DDMMYY') || '001'),
                'Ticket created',
                NOW() - INTERVAL '3 hours'
            ),
            (
                v_ticket_id_2, 'assigned', COALESCE(v_second_user_id, v_first_user_id),
                jsonb_build_object('assigned_to', COALESCE(v_second_user_id, v_first_user_id)),
                'Ticket assigned to sales team',
                NOW() - INTERVAL '2 hours'
            );

            -- Ticket 3: RFQ - Waiting Customer, EXIM
            INSERT INTO public.tickets (
                id, ticket_code, ticket_type, subject, description, department,
                created_by, assigned_to, priority, status,
                rfq_data
            ) VALUES (
                v_ticket_id_3,
                'RFQEXI' || TO_CHAR(CURRENT_DATE, 'DDMMYY') || '001',
                'RFQ',
                'Export Quote - FCL to Singapore',
                'Customer needs FCL export rate to Singapore for furniture products. Monthly shipment.',
                'EXI',
                v_first_user_id,
                v_first_user_id,
                'high',
                'waiting_customer',
                jsonb_build_object(
                    'service_type', 'FCL Export',
                    'cargo_category', 'Genco',
                    'cargo_description', 'Wooden Furniture',
                    'origin_city', 'Semarang',
                    'origin_country', 'Indonesia',
                    'destination_city', 'Singapore',
                    'destination_country', 'Singapore',
                    'quantity', 1,
                    'unit_of_measure', 'Container',
                    'weight_per_unit', 15000,
                    'incoterm', 'FOB'
                )
            );

            -- Insert SLA tracking for ticket 3
            INSERT INTO public.ticket_sla_tracking (
                ticket_id, first_response_sla_hours, resolution_sla_hours,
                first_response_at, first_response_met
            ) VALUES (v_ticket_id_3, 4, 48, NOW() - INTERVAL '1 day', TRUE);

            -- Ticket 4: GEN - Resolved
            INSERT INTO public.tickets (
                id, ticket_code, ticket_type, subject, description, department,
                created_by, assigned_to, priority, status,
                first_response_at, resolved_at
            ) VALUES (
                v_ticket_id_4,
                'GENMKT' || TO_CHAR(CURRENT_DATE, 'DDMMYY') || '001',
                'GEN',
                'Website inquiry follow-up',
                'Lead came through website form, needs callback regarding shipping services.',
                'MKT',
                v_first_user_id,
                v_first_user_id,
                'low',
                'resolved',
                NOW() - INTERVAL '5 hours',
                NOW() - INTERVAL '1 hour'
            );

            -- Insert SLA tracking for ticket 4
            INSERT INTO public.ticket_sla_tracking (
                ticket_id, first_response_sla_hours, resolution_sla_hours,
                first_response_at, first_response_met, resolution_at, resolution_met
            ) VALUES (
                v_ticket_id_4, 4, 24,
                NOW() - INTERVAL '5 hours', TRUE,
                NOW() - INTERVAL '1 hour', TRUE
            );

            -- Ticket 5: RFQ - Closed Won
            INSERT INTO public.tickets (
                id, ticket_code, ticket_type, subject, description, department,
                created_by, assigned_to, priority, status,
                first_response_at, resolved_at, closed_at,
                close_outcome, close_reason
            ) VALUES (
                v_ticket_id_5,
                'RFQDTD' || TO_CHAR(CURRENT_DATE, 'DDMMYY') || '001',
                'RFQ',
                'Import DTD Quote - Electronics from China',
                'Customer accepted our DTD import rate for monthly electronics shipment.',
                'DTD',
                v_first_user_id,
                v_first_user_id,
                'urgent',
                'closed',
                NOW() - INTERVAL '3 days',
                NOW() - INTERVAL '1 day',
                NOW() - INTERVAL '12 hours',
                'won',
                'Competitive rate accepted by customer'
            );

            -- Insert SLA tracking for ticket 5
            INSERT INTO public.ticket_sla_tracking (
                ticket_id, first_response_sla_hours, resolution_sla_hours,
                first_response_at, first_response_met, resolution_at, resolution_met
            ) VALUES (
                v_ticket_id_5, 4, 48,
                NOW() - INTERVAL '3 days', TRUE,
                NOW() - INTERVAL '1 day', TRUE
            );

            -- Insert sample comments
            INSERT INTO public.ticket_comments (
                ticket_id, user_id, content, is_internal
            ) VALUES
            (v_ticket_id_2, v_first_user_id, 'Initial response: Thank you for your inquiry. Our warehousing team will contact you shortly.', FALSE),
            (v_ticket_id_2, COALESCE(v_second_user_id, v_first_user_id), 'Internal note: Customer has existing relationship with EXIM team.', TRUE),
            (v_ticket_id_3, v_first_user_id, 'Quote sent to customer via email. Waiting for confirmation.', FALSE),
            (v_ticket_id_4, v_first_user_id, 'Called customer and scheduled a meeting for next week.', FALSE),
            (v_ticket_id_5, v_first_user_id, 'Customer confirmed acceptance of rate. Processing PO now.', FALSE);

            -- Insert rate quote for RFQ ticket 5
            INSERT INTO public.ticket_rate_quotes (
                ticket_id, quote_number, amount, currency, valid_until, terms, status, created_by
            ) VALUES (
                v_ticket_id_5,
                'QT-RFQDTD' || TO_CHAR(CURRENT_DATE, 'DDMMYY') || '001-001',
                15000000,
                'IDR',
                CURRENT_DATE + INTERVAL '30 days',
                'Door to door import service from Shenzhen to Jakarta. Transit time: 14-21 days.',
                'accepted',
                v_first_user_id
            );

            RAISE NOTICE 'Ticketing seed data inserted successfully';
        ELSE
            RAISE NOTICE 'Tickets already exist, skipping seed data';
        END IF;
    ELSE
        RAISE NOTICE 'No active users found, skipping ticketing seed data';
    END IF;
END $$;
