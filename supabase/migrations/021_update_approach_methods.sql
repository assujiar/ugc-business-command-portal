-- =====================================================
-- Migration: Update Approach Methods Enum
-- Adds new approach method values: Online Meeting, Phone Call, Texting
-- Updates activity_type_v2 enum to include these new values
-- =====================================================

-- Add new values to activity_type_v2 enum if they don't exist
DO $$
BEGIN
    -- Check if activity_type_v2 enum exists first
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type_v2') THEN
        -- Add 'Online Meeting' if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Online Meeting' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'activity_type_v2')) THEN
            ALTER TYPE activity_type_v2 ADD VALUE 'Online Meeting';
        END IF;

        -- Add 'Phone Call' if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Phone Call' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'activity_type_v2')) THEN
            ALTER TYPE activity_type_v2 ADD VALUE 'Phone Call';
        END IF;

        -- Add 'Texting' if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Texting' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'activity_type_v2')) THEN
            ALTER TYPE activity_type_v2 ADD VALUE 'Texting';
        END IF;
    END IF;
END$$;

-- Note: approach_method column in pipeline_updates uses text type, so no enum update needed
-- The application validates the values through TypeScript types

-- Add comment to document the valid approach methods (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_updates') THEN
        COMMENT ON COLUMN pipeline_updates.approach_method IS 'Valid values: Site Visit, Online Meeting, Phone Call, Texting, Email';
    END IF;
END$$;
