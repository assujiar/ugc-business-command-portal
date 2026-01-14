-- =====================================================
-- Seed Data for UGC Business Command Portal CRM
-- SOURCE: PDF - Sample Data for Testing
-- =====================================================

-- =====================================================
-- PROFILES (Test Users)
-- Password for all test users: Test123!
-- =====================================================

-- Note: You need to create these users in Supabase Auth first
-- Then use their UUIDs here

-- Example profiles (replace UUIDs with actual auth.users IDs)
INSERT INTO profiles (user_id, email, name, role, department, is_active) VALUES
('00000000-0000-0000-0000-000000000001', 'director@ugc.com', 'John Director', 'Director', 'Executive', true),
('00000000-0000-0000-0000-000000000002', 'admin@ugc.com', 'Admin Super', 'super admin', 'IT', true),
('00000000-0000-0000-0000-000000000003', 'marketing.mgr@ugc.com', 'Maria Marketing', 'Marketing Manager', 'Marketing', true),
('00000000-0000-0000-0000-000000000004', 'marcomm@ugc.com', 'Mike Marcomm', 'Marcomm', 'Marketing', true),
('00000000-0000-0000-0000-000000000005', 'dgo@ugc.com', 'Diana DGO', 'DGO', 'Marketing', true),
('00000000-0000-0000-0000-000000000006', 'sales.mgr@ugc.com', 'Steve Sales', 'sales manager', 'Sales', true),
('00000000-0000-0000-0000-000000000007', 'salesperson1@ugc.com', 'Sam Salesperson', 'salesperson', 'Sales', true),
('00000000-0000-0000-0000-000000000008', 'salesperson2@ugc.com', 'Sally Salesperson', 'salesperson', 'Sales', true),
('00000000-0000-0000-0000-000000000009', 'sales.support@ugc.com', 'Support Sarah', 'sales support', 'Sales', true),
('00000000-0000-0000-0000-000000000010', 'exim@ugc.com', 'Eric EXIM', 'EXIM Ops', 'Operations', true)
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- ACCOUNTS
-- =====================================================
INSERT INTO accounts (account_id, company_name, pic_name, pic_email, pic_phone, industry, city, country, owner_user_id, created_by) VALUES
('ACC20240101A1B2C3', 'PT Maju Bersama', 'Budi Santoso', 'budi@majubersama.co.id', '+6281234567890', 'Manufacturing', 'Jakarta', 'Indonesia', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007'),
('ACC20240102D4E5F6', 'CV Sukses Selalu', 'Dewi Lestari', 'dewi@suksesselalu.co.id', '+6281234567891', 'Retail', 'Surabaya', 'Indonesia', '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008'),
('ACC20240103G7H8I9', 'PT Global Logistics', 'Andi Wijaya', 'andi@globallog.co.id', '+6281234567892', 'Logistics', 'Bandung', 'Indonesia', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007'),
('ACC20240104J1K2L3', 'PT Tech Nusantara', 'Rina Maharani', 'rina@technusantara.co.id', '+6281234567893', 'Technology', 'Jakarta', 'Indonesia', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006')
ON CONFLICT (account_id) DO NOTHING;

-- =====================================================
-- CONTACTS
-- =====================================================
INSERT INTO contacts (contact_id, account_id, first_name, last_name, email, phone, job_title, is_primary, created_by) VALUES
('CON20240101A1B2C3', 'ACC20240101A1B2C3', 'Budi', 'Santoso', 'budi@majubersama.co.id', '+6281234567890', 'Director', true, '00000000-0000-0000-0000-000000000007'),
('CON20240101D4E5F6', 'ACC20240101A1B2C3', 'Siti', 'Rahayu', 'siti@majubersama.co.id', '+6281234567894', 'Procurement Manager', false, '00000000-0000-0000-0000-000000000007'),
('CON20240102G7H8I9', 'ACC20240102D4E5F6', 'Dewi', 'Lestari', 'dewi@suksesselalu.co.id', '+6281234567891', 'Owner', true, '00000000-0000-0000-0000-000000000008'),
('CON20240103J1K2L3', 'ACC20240103G7H8I9', 'Andi', 'Wijaya', 'andi@globallog.co.id', '+6281234567892', 'CEO', true, '00000000-0000-0000-0000-000000000007')
ON CONFLICT (contact_id) DO NOTHING;

-- =====================================================
-- LEADS (Various triage statuses)
-- =====================================================
INSERT INTO leads (lead_id, company_name, pic_name, pic_email, pic_phone, industry, source, triage_status, priority, inquiry_text, marketing_owner_user_id, created_by) VALUES
-- New leads for triage
('LEAD20240101A1B2C3', 'PT Baru Mandiri', 'Ahmad Fauzi', 'ahmad@barumandiri.co.id', '+6281234500001', 'Manufacturing', 'Website Form', 'New', 3, 'Interested in freight forwarding services for export', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
('LEAD20240102D4E5F6', 'CV Cemerlang Jaya', 'Putri Ayu', 'putri@cermelangjaya.co.id', '+6281234500002', 'Retail', 'Email Inquiry', 'New', 2, 'Need quote for domestic shipping', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004'),
('LEAD20240103G7H8I9', 'PT Digital Indonesia', 'Reza Pratama', 'reza@digitalindonesia.co.id', '+6281234500003', 'Technology', 'Referral', 'New', 4, 'Urgent: Need air freight for electronics', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),

-- In Review leads
('LEAD20240104J1K2L3', 'PT Sentosa Abadi', 'Linda Wijaya', 'linda@sentosaabadi.co.id', '+6281234500004', 'Food & Beverage', 'Event', 'In Review', 3, 'Interested in cold chain logistics', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
('LEAD20240105M4N5O6', 'CV Prima Karya', 'Bambang Susilo', 'bambang@primakarya.co.id', '+6281234500005', 'Construction', 'Social Media', 'In Review', 2, 'Heavy equipment transport inquiry', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004'),

-- Nurture leads
('LEAD20240106P7Q8R9', 'PT Indah Permai', 'Sri Wahyuni', 'sri@indahpermai.co.id', '+6281234500006', 'Real Estate', 'WhatsApp', 'Nurture', 1, 'Long term project, not ready yet', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),

-- Disqualified leads
('LEAD20240107S1T2U3', 'CV Kecil Usaha', 'Joko Widodo', 'joko@kecil.co.id', '+6281234500007', 'Other', 'Cold Outbound', 'Disqualified', 1, 'Too small for our services', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003')
ON CONFLICT (lead_id) DO NOTHING;

-- Update disqualified lead with reason
UPDATE leads SET disqualification_reason = 'Company too small for minimum order quantity', disqualified_at = NOW() WHERE lead_id = 'LEAD20240107S1T2U3';

-- =====================================================
-- LEAD HANDOVER POOL (Leads ready for sales)
-- =====================================================

-- First, create some qualified leads that were handed over
INSERT INTO leads (lead_id, company_name, pic_name, pic_email, pic_phone, industry, source, triage_status, priority, inquiry_text, handover_eligible, marketing_owner_user_id, created_by) VALUES
('LEAD20240108V4W5X6', 'PT Export Prima', 'Dian Kusuma', 'dian@exportprima.co.id', '+6281234500008', 'Manufacturing', 'Website Form', 'Handed Over', 3, 'Regular export shipments needed', true, '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
('LEAD20240109Y7Z8A9', 'PT Import Sejahtera', 'Ferry Gunawan', 'ferry@importsejahtera.co.id', '+6281234500009', 'Retail', 'Referral', 'Handed Over', 4, 'High volume imports from China', true, '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003')
ON CONFLICT (lead_id) DO NOTHING;

-- Add to handover pool
INSERT INTO lead_handover_pool (lead_id, handed_over_by, handover_notes, priority, expires_at) VALUES
('LEAD20240108V4W5X6', '00000000-0000-0000-0000-000000000003', 'Hot lead - they need quote within 3 days', 3, NOW() + INTERVAL '7 days'),
('LEAD20240109Y7Z8A9', '00000000-0000-0000-0000-000000000003', 'High value potential - CEO directly interested', 4, NOW() + INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- =====================================================
-- OPPORTUNITIES
-- =====================================================
INSERT INTO opportunities (opportunity_id, name, account_id, stage, estimated_value, currency, probability, expected_close_date, next_step, next_step_due_date, owner_user_id, created_by) VALUES
('OPP20240101A1B2C3', 'Maju Bersama Export Contract', 'ACC20240101A1B2C3', 'Negotiation', 150000000, 'IDR', 70, '2024-03-31', 'Final price negotiation meeting', '2024-02-15', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007'),
('OPP20240102D4E5F6', 'Sukses Selalu Distribution Deal', 'ACC20240102D4E5F6', 'Quote Sent', 75000000, 'IDR', 50, '2024-04-15', 'Follow up on quote', '2024-02-20', '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008'),
('OPP20240103G7H8I9', 'Global Logistics Partnership', 'ACC20240103G7H8I9', 'Discovery', 200000000, 'IDR', 30, '2024-05-01', 'Site visit scheduled', '2024-02-10', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007'),
('OPP20240104J1K2L3', 'Tech Nusantara Express Service', 'ACC20240104J1K2L3', 'Prospecting', 50000000, 'IDR', 20, '2024-06-01', 'Initial call', '2024-02-18', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006')
ON CONFLICT (opportunity_id) DO NOTHING;

-- =====================================================
-- ACTIVITIES
-- =====================================================
INSERT INTO activities (activity_id, activity_type, subject, description, status, due_date, related_account_id, related_opportunity_id, owner_user_id, created_by) VALUES
('ACT20240101A1B2C3', 'Meeting', 'Final negotiation with Maju Bersama', 'Discuss final pricing and contract terms', 'Planned', '2024-02-15', 'ACC20240101A1B2C3', 'OPP20240101A1B2C3', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007'),
('ACT20240102D4E5F6', 'Call', 'Quote follow-up call', 'Check if they received the quote and answer questions', 'Planned', '2024-02-20', 'ACC20240102D4E5F6', 'OPP20240102D4E5F6', '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008'),
('ACT20240103G7H8I9', 'Site Visit', 'Visit Global Logistics facility', 'Understand their operations and requirements', 'Planned', '2024-02-10', 'ACC20240103G7H8I9', 'OPP20240103G7H8I9', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007'),
('ACT20240104J1K2L3', 'Call', 'Initial discovery call with Tech Nusantara', 'Introduce services and understand needs', 'Done', '2024-02-05', 'ACC20240104J1K2L3', 'OPP20240104J1K2L3', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006'),
('ACT20240105M4N5O6', 'Email', 'Send company profile to Tech Nusantara', 'Follow up from call with company presentation', 'Done', '2024-02-06', 'ACC20240104J1K2L3', 'OPP20240104J1K2L3', '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006')
ON CONFLICT (activity_id) DO NOTHING;

-- Update completed activities
UPDATE activities SET completed_at = NOW(), outcome = 'Positive response, interested in services' WHERE activity_id IN ('ACT20240104J1K2L3', 'ACT20240105M4N5O6');

-- =====================================================
-- PROSPECTING TARGETS
-- =====================================================
INSERT INTO prospecting_targets (target_id, company_name, pic_name, pic_email, pic_phone, industry, source, status, notes, owner_user_id, created_by) VALUES
('TGT20240101A1B2C3', 'PT Mega Industries', 'Hendra Lim', 'hendra@megaind.co.id', '+6281234600001', 'Manufacturing', 'LinkedIn', 'researching', 'Large manufacturer, potential for regular exports', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007'),
('TGT20240102D4E5F6', 'CV Fashion Forward', 'Jessica Tan', 'jessica@fashionfw.co.id', '+6281234600002', 'Retail', 'Industry Event', 'outreach_planned', 'Expanding to international markets', '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008'),
('TGT20240103G7H8I9', 'PT Pharma Plus', 'Dr. Agus Santoso', 'agus@pharmaplus.co.id', '+6281234600003', 'Healthcare', 'Referral', 'contacted', 'Need cold chain logistics for pharmaceuticals', '00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000007'),
('TGT20240104J1K2L3', 'PT Agro Lestari', 'Wawan Kurniawan', 'wawan@agrolestari.co.id', '+6281234600004', 'Agriculture', 'Cold Call', 'meeting_scheduled', 'Agricultural exports to Middle East', '00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000008')
ON CONFLICT (target_id) DO NOTHING;

-- =====================================================
-- CADENCES (Automation Templates)
-- =====================================================
INSERT INTO cadences (name, description, is_active, owner_user_id, created_by) VALUES
('New Lead Follow-up', 'Standard follow-up sequence for new leads', true, '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006'),
('Quote Follow-up', 'Sequence after sending quote', true, '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006'),
('Post-Meeting Nurture', 'Long-term nurture after initial meeting', true, '00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- Get cadence IDs and insert steps
DO $$
DECLARE
    new_lead_cadence_id INTEGER;
    quote_cadence_id INTEGER;
BEGIN
    SELECT cadence_id INTO new_lead_cadence_id FROM cadences WHERE name = 'New Lead Follow-up' LIMIT 1;
    SELECT cadence_id INTO quote_cadence_id FROM cadences WHERE name = 'Quote Follow-up' LIMIT 1;

    IF new_lead_cadence_id IS NOT NULL THEN
        INSERT INTO cadence_steps (cadence_id, step_number, activity_type, subject_template, description_template, delay_days) VALUES
        (new_lead_cadence_id, 1, 'Email', 'Introduction to UGC Services', 'Send company profile and service overview', 0),
        (new_lead_cadence_id, 2, 'Call', 'Follow-up call on introduction email', 'Check if they received email, schedule meeting', 2),
        (new_lead_cadence_id, 3, 'Email', 'Case study relevant to their industry', 'Share success story from similar company', 5),
        (new_lead_cadence_id, 4, 'Call', 'Second follow-up', 'Final attempt to schedule meeting', 7)
        ON CONFLICT DO NOTHING;
    END IF;

    IF quote_cadence_id IS NOT NULL THEN
        INSERT INTO cadence_steps (cadence_id, step_number, activity_type, subject_template, description_template, delay_days) VALUES
        (quote_cadence_id, 1, 'Call', 'Quote delivery confirmation', 'Confirm they received quote, answer questions', 1),
        (quote_cadence_id, 2, 'Email', 'Quote comparison guide', 'Help them evaluate our quote vs competitors', 3),
        (quote_cadence_id, 3, 'Call', 'Decision timeline check', 'Understand their decision process', 5),
        (quote_cadence_id, 4, 'Meeting', 'Negotiation meeting', 'Schedule if they have questions on pricing', 7)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- =====================================================
-- AUDIT LOGS (Sample entries)
-- =====================================================
INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, details) VALUES
('lead', 'LEAD20240108V4W5X6', 'handover', '00000000-0000-0000-0000-000000000003', '{"from_status": "Qualified", "to_status": "Handed Over"}'),
('opportunity', 'OPP20240101A1B2C3', 'stage_change', '00000000-0000-0000-0000-000000000007', '{"from_stage": "Quote Sent", "to_stage": "Negotiation"}'),
('account', 'ACC20240101A1B2C3', 'create', '00000000-0000-0000-0000-000000000007', '{"company_name": "PT Maju Bersama"}')
ON CONFLICT DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Seed data inserted successfully!';
    RAISE NOTICE 'Test users created (password: Test123!):';
    RAISE NOTICE '- director@ugc.com (Director)';
    RAISE NOTICE '- admin@ugc.com (super admin)';
    RAISE NOTICE '- marketing.mgr@ugc.com (Marketing Manager)';
    RAISE NOTICE '- sales.mgr@ugc.com (sales manager)';
    RAISE NOTICE '- salesperson1@ugc.com (salesperson)';
END $$;
