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

-- All 15 roles (using actual auth.users IDs from Supabase)
INSERT INTO profiles (user_id, email, name, role, department, is_active) VALUES
-- Executive
('e05690c2-0144-4f61-bcee-d95dcc19412d', 'director@example.com', 'John Director', 'Director', 'Executive', true),
-- IT/Admin
('3846e6dc-807a-4179-afb5-92c5c63d26dd', 'admin@example.com', 'Admin Super', 'super admin', 'IT', true),
-- Marketing Team (5 roles)
('6ce3f3e0-3e22-4a12-97c2-abd7152057f8', 'marketing.manager@example.com', 'Maria Marketing', 'Marketing Manager', 'Marketing', true),
('a49378cf-775d-48a6-ad5b-fea2f4b56a95', 'marcomm@example.com', 'Mike Marcomm', 'Marcomm', 'Marketing', true),
('79d7c2d9-e542-4ad5-87a1-483c380c75c4', 'dgo@example.com', 'Diana DGO', 'DGO', 'Marketing', true),
('44587e03-8582-464f-a088-8efcb0079533', 'macx@example.com', 'Max MACX', 'MACX', 'Marketing', true),
('0ab48580-fd10-4ee3-823f-b05e2592dcb7', 'vsdo@example.com', 'Victor VSDO', 'VSDO', 'Marketing', true),
-- Sales Team (4 roles)
('f46cfab2-4b61-4204-ab29-efcb2b3e5c5d', 'sales.manager@example.com', 'Steve Sales', 'sales manager', 'Sales', true),
('3a673e5b-c28f-45fd-98f5-adf04a1dacc0', 'sales.person@example.com', 'Sam Salesperson', 'salesperson', 'Sales', true),
('ce9ec41f-b018-438f-b9e5-e8c51331a101', 'sales.support@example.com', 'Support Sarah', 'sales support', 'Sales', true),
-- Operations Team (4 roles)
('6fd5d685-6c36-4dc8-90d1-b354eb080f5b', 'exim.ops@example.com', 'Eric EXIM', 'EXIM Ops', 'Operations', true),
('70b938e0-a30a-4127-9f66-83279ace9853', 'dom.ops@example.com', 'Donna Domestics', 'domestics Ops', 'Operations', true),
('bcad5f3d-8717-4bfb-abc4-09bf1dce2a23', 'import.ops@example.com', 'Ivan Import', 'Import DTD Ops', 'Operations', true),
('7350b50c-6e9c-4be9-b32b-79e6174115ab', 'warehouse@example.com', 'Willy Warehouse', 'traffic & warehous', 'Operations', true),
-- Finance
('23cd4061-0072-4d30-8cbb-5c387ebf1492', 'finance@example.com', 'Fiona Finance', 'finance', 'Finance', true)
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- ACCOUNTS
-- =====================================================
INSERT INTO accounts (account_id, company_name, pic_name, pic_email, pic_phone, industry, city, country, owner_user_id, created_by) VALUES
('ACC20240101A1B2C3', 'PT Maju Bersama', 'Budi Santoso', 'budi@majubersama.co.id', '+6281234567890', 'Manufacturing', 'Jakarta', 'Indonesia', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('ACC20240102D4E5F6', 'CV Sukses Selalu', 'Dewi Lestari', 'dewi@suksesselalu.co.id', '+6281234567891', 'Retail', 'Surabaya', 'Indonesia', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('ACC20240103G7H8I9', 'PT Global Logistics', 'Andi Wijaya', 'andi@globallog.co.id', '+6281234567892', 'Logistics', 'Bandung', 'Indonesia', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('ACC20240104J1K2L3', 'PT Tech Nusantara', 'Rina Maharani', 'rina@technusantara.co.id', '+6281234567893', 'Technology', 'Jakarta', 'Indonesia', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d')
ON CONFLICT (account_id) DO NOTHING;

-- =====================================================
-- CONTACTS
-- =====================================================
INSERT INTO contacts (contact_id, account_id, first_name, last_name, email, phone, job_title, is_primary, created_by) VALUES
('CON20240101A1B2C3', 'ACC20240101A1B2C3', 'Budi', 'Santoso', 'budi@majubersama.co.id', '+6281234567890', 'Director', true, '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('CON20240101D4E5F6', 'ACC20240101A1B2C3', 'Siti', 'Rahayu', 'siti@majubersama.co.id', '+6281234567894', 'Procurement Manager', false, '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('CON20240102G7H8I9', 'ACC20240102D4E5F6', 'Dewi', 'Lestari', 'dewi@suksesselalu.co.id', '+6281234567891', 'Owner', true, '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('CON20240103J1K2L3', 'ACC20240103G7H8I9', 'Andi', 'Wijaya', 'andi@globallog.co.id', '+6281234567892', 'CEO', true, '3a673e5b-c28f-45fd-98f5-adf04a1dacc0')
ON CONFLICT (contact_id) DO NOTHING;

-- =====================================================
-- LEADS (Various triage statuses)
-- =====================================================
INSERT INTO leads (lead_id, company_name, contact_name, contact_email, contact_phone, source, triage_status, notes, marketing_owner_user_id, created_by) VALUES
-- New leads for triage
('LEAD20240101A1B2C3', 'PT Baru Mandiri', 'Ahmad Fauzi', 'ahmad@barumandiri.co.id', '+6281234500001', 'Website Form', 'New', 'Interested in freight forwarding services for export', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8'),
('LEAD20240102D4E5F6', 'CV Cemerlang Jaya', 'Putri Ayu', 'putri@cermelangjaya.co.id', '+6281234500002', 'Email Inquiry', 'New', 'Need quote for domestic shipping', 'a49378cf-775d-48a6-ad5b-fea2f4b56a95', 'a49378cf-775d-48a6-ad5b-fea2f4b56a95'),
('LEAD20240103G7H8I9', 'PT Digital Indonesia', 'Reza Pratama', 'reza@digitalindonesia.co.id', '+6281234500003', 'Referral', 'New', 'Urgent: Need air freight for electronics', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8'),

-- In Review leads
('LEAD20240104J1K2L3', 'PT Sentosa Abadi', 'Linda Wijaya', 'linda@sentosaabadi.co.id', '+6281234500004', 'Event', 'In Review', 'Interested in cold chain logistics', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8'),
('LEAD20240105M4N5O6', 'CV Prima Karya', 'Bambang Susilo', 'bambang@primakarya.co.id', '+6281234500005', 'Social Media', 'In Review', 'Heavy equipment transport inquiry', 'a49378cf-775d-48a6-ad5b-fea2f4b56a95', 'a49378cf-775d-48a6-ad5b-fea2f4b56a95'),

-- Nurture leads
('LEAD20240106P7Q8R9', 'PT Indah Permai', 'Sri Wahyuni', 'sri@indahpermai.co.id', '+6281234500006', 'WhatsApp', 'Nurture', 'Long term project, not ready yet', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8'),

-- Disqualified leads
('LEAD20240107S1T2U3', 'CV Kecil Usaha', 'Joko Widodo', 'joko@kecil.co.id', '+6281234500007', 'Cold Outbound', 'Disqualified', 'Too small for our services', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8')
ON CONFLICT (lead_id) DO NOTHING;

-- Update disqualified lead with reason
UPDATE leads SET disqualified_reason = 'Company too small for minimum order quantity', disqualified_at = NOW() WHERE lead_id = 'LEAD20240107S1T2U3';

-- =====================================================
-- LEAD HANDOVER POOL (Leads ready for sales)
-- =====================================================

-- First, create some qualified leads that were handed over
INSERT INTO leads (lead_id, company_name, contact_name, contact_email, contact_phone, source, triage_status, notes, handover_eligible, marketing_owner_user_id, created_by) VALUES
('LEAD20240108V4W5X6', 'PT Export Prima', 'Dian Kusuma', 'dian@exportprima.co.id', '+6281234500008', 'Website Form', 'Handed Over', 'Regular export shipments needed', true, '6ce3f3e0-3e22-4a12-97c2-abd7152057f8', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8'),
('LEAD20240109Y7Z8A9', 'PT Import Sejahtera', 'Ferry Gunawan', 'ferry@importsejahtera.co.id', '+6281234500009', 'Referral', 'Handed Over', 'High volume imports from China', true, '6ce3f3e0-3e22-4a12-97c2-abd7152057f8', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8')
ON CONFLICT (lead_id) DO NOTHING;

-- Add to handover pool
INSERT INTO lead_handover_pool (lead_id, handed_over_by, handover_notes, priority, expires_at) VALUES
('LEAD20240108V4W5X6', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8', 'Hot lead - they need quote within 3 days', 3, NOW() + INTERVAL '7 days'),
('LEAD20240109Y7Z8A9', '6ce3f3e0-3e22-4a12-97c2-abd7152057f8', 'High value potential - CEO directly interested', 4, NOW() + INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- =====================================================
-- OPPORTUNITIES
-- =====================================================
INSERT INTO opportunities (opportunity_id, name, account_id, stage, estimated_value, currency, probability, next_step, next_step_due_date, owner_user_id, created_by) VALUES
('OPP20240101A1B2C3', 'Maju Bersama Export Contract', 'ACC20240101A1B2C3', 'Negotiation', 150000000, 'IDR', 70, 'Final price negotiation meeting', '2024-02-15', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('OPP20240102D4E5F6', 'Sukses Selalu Distribution Deal', 'ACC20240102D4E5F6', 'Quote Sent', 75000000, 'IDR', 50, 'Follow up on quote', '2024-02-20', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('OPP20240103G7H8I9', 'Global Logistics Partnership', 'ACC20240103G7H8I9', 'Discovery', 200000000, 'IDR', 30, 'Site visit scheduled', '2024-02-10', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('OPP20240104J1K2L3', 'Tech Nusantara Express Service', 'ACC20240104J1K2L3', 'Prospecting', 50000000, 'IDR', 20, 'Initial call', '2024-02-18', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d')
ON CONFLICT (opportunity_id) DO NOTHING;

-- =====================================================
-- ACTIVITIES
-- =====================================================
INSERT INTO activities (activity_id, activity_type, subject, description, status, due_date, related_account_id, related_opportunity_id, owner_user_id, created_by) VALUES
('ACT20240101A1B2C3', 'Meeting', 'Final negotiation with Maju Bersama', 'Discuss final pricing and contract terms', 'Planned', '2024-02-15', 'ACC20240101A1B2C3', 'OPP20240101A1B2C3', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('ACT20240102D4E5F6', 'Call', 'Quote follow-up call', 'Check if they received the quote and answer questions', 'Planned', '2024-02-20', 'ACC20240102D4E5F6', 'OPP20240102D4E5F6', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('ACT20240103G7H8I9', 'Site Visit', 'Visit Global Logistics facility', 'Understand their operations and requirements', 'Planned', '2024-02-10', 'ACC20240103G7H8I9', 'OPP20240103G7H8I9', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('ACT20240104J1K2L3', 'Call', 'Initial discovery call with Tech Nusantara', 'Introduce services and understand needs', 'Done', '2024-02-05', 'ACC20240104J1K2L3', 'OPP20240104J1K2L3', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d'),
('ACT20240105M4N5O6', 'Email', 'Send company profile to Tech Nusantara', 'Follow up from call with company presentation', 'Done', '2024-02-06', 'ACC20240104J1K2L3', 'OPP20240104J1K2L3', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d')
ON CONFLICT (activity_id) DO NOTHING;

-- Update completed activities
UPDATE activities SET completed_at = NOW(), outcome = 'Positive response, interested in services' WHERE activity_id IN ('ACT20240104J1K2L3', 'ACT20240105M4N5O6');

-- =====================================================
-- PROSPECTING TARGETS
-- =====================================================
INSERT INTO prospecting_targets (target_id, company_name, contact_name, contact_email, contact_phone, industry, source, status, notes, owner_user_id, created_by) VALUES
('TGT20240101A1B2C3', 'PT Mega Industries', 'Hendra Lim', 'hendra@megaind.co.id', '+6281234600001', 'Manufacturing', 'LinkedIn', 'new_target', 'Large manufacturer, potential for regular exports', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('TGT20240102D4E5F6', 'CV Fashion Forward', 'Jessica Tan', 'jessica@fashionfw.co.id', '+6281234600002', 'Retail', 'Industry Event', 'new_target', 'Expanding to international markets', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('TGT20240103G7H8I9', 'PT Pharma Plus', 'Dr. Agus Santoso', 'agus@pharmaplus.co.id', '+6281234600003', 'Healthcare', 'Referral', 'contacted', 'Need cold chain logistics for pharmaceuticals', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0'),
('TGT20240104J1K2L3', 'PT Agro Lestari', 'Wawan Kurniawan', 'wawan@agrolestari.co.id', '+6281234600004', 'Agriculture', 'Cold Call', 'engaged', 'Agricultural exports to Middle East', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0', '3a673e5b-c28f-45fd-98f5-adf04a1dacc0')
ON CONFLICT (target_id) DO NOTHING;

-- =====================================================
-- CADENCES (Automation Templates)
-- =====================================================
INSERT INTO cadences (name, description, is_active, owner_user_id, created_by) VALUES
('New Lead Follow-up', 'Standard follow-up sequence for new leads', true, 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d'),
('Quote Follow-up', 'Sequence after sending quote', true, 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d'),
('Post-Meeting Nurture', 'Long-term nurture after initial meeting', true, 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d', 'f46cfab2-4b61-4204-ab29-efcb2b3e5c5d')
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
INSERT INTO audit_logs (user_id, module, action, record_id, record_type, after_data) VALUES
('6ce3f3e0-3e22-4a12-97c2-abd7152057f8', 'leads', 'handover', 'LEAD20240108V4W5X6', 'lead', '{"from_status": "Qualified", "to_status": "Handed Over"}'),
('3a673e5b-c28f-45fd-98f5-adf04a1dacc0', 'opportunities', 'stage_change', 'OPP20240101A1B2C3', 'opportunity', '{"from_stage": "Quote Sent", "to_stage": "Negotiation"}'),
('3a673e5b-c28f-45fd-98f5-adf04a1dacc0', 'crm', 'create', 'ACC20240101A1B2C3', 'account', '{"company_name": "PT Maju Bersama"}')
ON CONFLICT DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Seed data inserted successfully!';
    RAISE NOTICE 'Test users (15 roles):';
    RAISE NOTICE '-- Executive --';
    RAISE NOTICE '- director@example.com (Director)';
    RAISE NOTICE '-- IT/Admin --';
    RAISE NOTICE '- admin@example.com (super admin)';
    RAISE NOTICE '-- Marketing Team --';
    RAISE NOTICE '- marketing.manager@example.com (Marketing Manager)';
    RAISE NOTICE '- marcomm@example.com (Marcomm)';
    RAISE NOTICE '- dgo@example.com (DGO)';
    RAISE NOTICE '- macx@example.com (MACX)';
    RAISE NOTICE '- vsdo@example.com (VSDO)';
    RAISE NOTICE '-- Sales Team --';
    RAISE NOTICE '- sales.manager@example.com (sales manager)';
    RAISE NOTICE '- sales.person@example.com (salesperson)';
    RAISE NOTICE '- sales.support@example.com (sales support)';
    RAISE NOTICE '-- Operations Team --';
    RAISE NOTICE '- exim.ops@example.com (EXIM Ops)';
    RAISE NOTICE '- dom.ops@example.com (domestics Ops)';
    RAISE NOTICE '- import.ops@example.com (Import DTD Ops)';
    RAISE NOTICE '- warehouse@example.com (traffic & warehous)';
    RAISE NOTICE '-- Finance --';
    RAISE NOTICE '- finance@example.com (finance)';
END $$;
