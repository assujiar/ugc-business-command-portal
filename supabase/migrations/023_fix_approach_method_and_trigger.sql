-- =====================================================
-- Migration 023: Fix Approach Method Enum and Stage History Trigger
-- 1. Add missing enum values to approach_method
-- 2. Add old_stage/new_stage columns to opportunity_stage_history
-- 3. Fix trigger to handle NULL auth.uid() (admin client calls)
-- =====================================================

-- =====================================================
-- PART 1: Add missing approach_method enum values
-- Frontend uses: 'Site Visit', 'Online Meeting', 'Phone Call', 'Texting', 'Email'
-- Existing: 'Call', 'Email', 'Meeting', 'Site Visit', 'WhatsApp', 'Proposal', 'Contract Review'
-- Missing: 'Online Meeting', 'Phone Call', 'Texting'
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approach_method') THEN
        -- Add 'Online Meeting' if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'Online Meeting'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'approach_method')
        ) THEN
            ALTER TYPE approach_method ADD VALUE 'Online Meeting';
        END IF;

        -- Add 'Phone Call' if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'Phone Call'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'approach_method')
        ) THEN
            ALTER TYPE approach_method ADD VALUE 'Phone Call';
        END IF;

        -- Add 'Texting' if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'Texting'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'approach_method')
        ) THEN
            ALTER TYPE approach_method ADD VALUE 'Texting';
        END IF;
    END IF;
END$$;

-- =====================================================
-- PART 2: Add old_stage and new_stage columns to opportunity_stage_history
-- The table has from_stage/to_stage but API expects old_stage/new_stage
-- Add new columns and migrate data
-- =====================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'opportunity_stage_history') THEN
        -- Add old_stage column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'opportunity_stage_history' AND column_name = 'old_stage'
        ) THEN
            ALTER TABLE opportunity_stage_history ADD COLUMN old_stage opportunity_stage;
            -- Copy data from from_stage
            UPDATE opportunity_stage_history SET old_stage = from_stage;
        END IF;

        -- Add new_stage column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'opportunity_stage_history' AND column_name = 'new_stage'
        ) THEN
            ALTER TABLE opportunity_stage_history ADD COLUMN new_stage opportunity_stage;
            -- Copy data from to_stage and make it NOT NULL after
            UPDATE opportunity_stage_history SET new_stage = to_stage;
            ALTER TABLE opportunity_stage_history ALTER COLUMN new_stage SET NOT NULL;
        END IF;
    END IF;
END$$;

-- =====================================================
-- PART 3: Fix Stage History Trigger
-- The trigger uses auth.uid() which returns NULL when using adminClient
-- Since the API already manually creates stage history records,
-- we update the trigger to skip insertion when auth.uid() is NULL
-- =====================================================

CREATE OR REPLACE FUNCTION log_stage_change()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
BEGIN
    -- Get the current user ID
    current_user_id := auth.uid();

    -- Only log if stage actually changed AND we have a valid user ID
    -- When auth.uid() is NULL (admin client), skip trigger insertion
    -- The API handles stage history creation manually in this case
    IF OLD.stage IS DISTINCT FROM NEW.stage AND current_user_id IS NOT NULL THEN
        -- Insert all 4 columns for backward compatibility
        -- from_stage/to_stage are the original columns (NOT NULL)
        -- old_stage/new_stage are added by this migration
        INSERT INTO opportunity_stage_history (
            opportunity_id,
            from_stage,
            to_stage,
            old_stage,
            new_stage,
            changed_by
        )
        VALUES (
            NEW.opportunity_id,
            OLD.stage,
            NEW.stage,
            OLD.stage,
            NEW.stage,
            current_user_id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the trigger behavior
COMMENT ON FUNCTION log_stage_change() IS 'Logs opportunity stage changes. Skips when auth.uid() is NULL (admin client calls) because API handles it manually.';
