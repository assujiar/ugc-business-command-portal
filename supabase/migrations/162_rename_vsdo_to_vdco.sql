-- =====================================================
-- Migration 162: Rename VSDO role to VDCO
-- Corrects role name from VSDO to VDCO across:
--   1. user_role ENUM value
--   2. All functions referencing 'VSDO'
--   3. All RLS policies with inline 'VSDO' checks
-- =====================================================

-- 1. Rename the ENUM value
ALTER TYPE user_role RENAME VALUE 'VSDO' TO 'VDCO';

-- =====================================================
-- 2. Recreate all functions that reference 'VSDO'
-- =====================================================

-- From migration 010: is_marketing()
CREATE OR REPLACE FUNCTION is_marketing()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Director', 'super admin', 'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- From migration 019/016: is_user_in_marketing_department()
CREATE OR REPLACE FUNCTION is_user_in_marketing_department()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  user_dept TEXT;
BEGIN
  SELECT role, department INTO user_role, user_dept
  FROM public.profiles
  WHERE user_id = auth.uid() AND is_active = TRUE;

  -- Check by department field (case insensitive)
  IF user_dept IS NOT NULL AND LOWER(user_dept) LIKE '%marketing%' THEN
    RETURN TRUE;
  END IF;

  -- Also check by marketing roles (as fallback)
  IF user_role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- From migration 027: is_marketing_staff()
CREATE OR REPLACE FUNCTION is_marketing_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Marcomm', 'DGO', 'VDCO');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_marketing_staff() IS 'Check if user is marketing staff (Marcomm/DGO/VDCO)';

-- From migration 036: get_user_ticketing_department(UUID)
CREATE OR REPLACE FUNCTION get_user_ticketing_department(user_id UUID)
RETURNS ticketing_department AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE profiles.user_id = get_user_ticketing_department.user_id AND is_active = TRUE;

    -- Map CRM roles to ticketing departments
    CASE user_role
        WHEN 'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO' THEN RETURN 'MKT';
        WHEN 'sales manager', 'salesperson', 'sales support' THEN RETURN 'SAL';
        WHEN 'domestics Ops' THEN RETURN 'DOM';
        WHEN 'EXIM Ops' THEN RETURN 'EXI';
        WHEN 'Import DTD Ops' THEN RETURN 'DTD';
        WHEN 'traffic & warehous' THEN RETURN 'TRF';
        ELSE RETURN NULL;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- From migration 075: is_marketing_creator(UUID, UUID)
CREATE OR REPLACE FUNCTION is_marketing_creator(p_user_id UUID, p_opportunity_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role TEXT;
    v_original_creator_id UUID;
BEGIN
    -- Get user role
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE user_id = p_user_id AND is_active = TRUE;

    -- Check if user is marketing
    IF v_user_role NOT IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO') THEN
        RETURN FALSE;
    END IF;

    -- Get original creator from opportunity
    SELECT original_creator_id INTO v_original_creator_id
    FROM public.opportunities
    WHERE opportunity_id = p_opportunity_id;

    -- Marketing Manager and MACX can see all marketing-created pipelines
    IF v_user_role IN ('Marketing Manager', 'MACX') THEN
        -- Check if original creator is from marketing
        RETURN EXISTS (
            SELECT 1 FROM public.profiles
            WHERE user_id = v_original_creator_id
            AND role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO')
        );
    END IF;

    -- Other marketing roles can only see their own created pipelines
    RETURN p_user_id = v_original_creator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- From migration 077: get_role_category(TEXT)
CREATE OR REPLACE FUNCTION public.get_role_category(p_role TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE
        WHEN p_role IN ('EXIM Ops', 'domestics Ops', 'Import DTD Ops', 'traffic & warehous') THEN 'Ops'
        WHEN p_role IN ('salesperson', 'sales manager', 'sales support') THEN 'Sales'
        WHEN p_role IN ('Marcomm', 'Marketing Manager', 'MACX') THEN 'Marketing'
        WHEN p_role IN ('DGO', 'VDCO') THEN 'Operations Support'
        WHEN p_role IN ('finance') THEN 'Finance'
        WHEN p_role IN ('Director', 'super admin') THEN 'Management'
        ELSE 'Other'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- From migration 157: fn_is_marketing_user()
CREATE OR REPLACE FUNCTION fn_is_marketing_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('super admin', 'Director', 'Marketing Manager',
                          'Marcomm', 'DGO', 'MACX', 'VDCO')
  );
$$;

-- From migration 161: fn_is_design_producer()
CREATE OR REPLACE FUNCTION fn_is_design_producer()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND role = 'VDCO'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- 3. Recreate RLS policies with inline 'VSDO' references
-- =====================================================

-- From migration 154: marketing_social_media_analytics
DROP POLICY IF EXISTS "marketing_analytics_select" ON marketing_social_media_analytics;
CREATE POLICY "marketing_analytics_select" ON marketing_social_media_analytics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN (
        'Director', 'super admin',
        'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO'
      )
    )
  );

DROP POLICY IF EXISTS "marketing_daily_summary_select" ON marketing_social_media_daily_summary;
CREATE POLICY "marketing_daily_summary_select" ON marketing_social_media_daily_summary
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN (
        'Director', 'super admin',
        'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO'
      )
    )
  );

-- From migration 155: marketing_social_media_content
DROP POLICY IF EXISTS "marketing_content_select" ON marketing_social_media_content;
CREATE POLICY "marketing_content_select" ON marketing_social_media_content
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN (
        'Director', 'super admin',
        'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO'
      )
    )
  );

DROP POLICY IF EXISTS "marketing_content_history_select" ON marketing_social_media_content_history;
CREATE POLICY "marketing_content_history_select" ON marketing_social_media_content_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN (
        'Director', 'super admin',
        'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO'
      )
    )
  );
