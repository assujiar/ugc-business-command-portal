-- =====================================================
-- Migration 032: Add WhatsApp to approach_method enum
--
-- Adds WhatsApp as a valid approach method for
-- sales plans and pipeline updates
-- =====================================================

DO $$
BEGIN
    -- Check if enum exists and WhatsApp value doesn't exist
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approach_method') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = 'WhatsApp'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'approach_method')
        ) THEN
            ALTER TYPE approach_method ADD VALUE 'WhatsApp';
            RAISE NOTICE 'Added WhatsApp to approach_method enum';
        ELSE
            RAISE NOTICE 'WhatsApp already exists in approach_method enum';
        END IF;
    ELSE
        RAISE NOTICE 'approach_method enum does not exist';
    END IF;
END$$;

-- Update comment to reflect all valid values
COMMENT ON TYPE approach_method IS 'Valid approach methods: Site Visit, Online Meeting, Phone Call, WhatsApp, Texting, Email';
