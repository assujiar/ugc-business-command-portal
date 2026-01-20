-- =====================================================
-- Migration: 045_sync_account_pic_to_contacts.sql
-- Sync PIC (Person In Contact) data from accounts to contacts table
-- =====================================================
-- Problem: accounts table has pic_name, pic_email, pic_phone fields
-- but contacts table is empty for many accounts
-- Solution: Create contacts from existing account PIC data and
-- add trigger to auto-create contact when account is created/updated
-- =====================================================

-- 1. Populate contacts table from existing accounts that have PIC data
-- but no corresponding contact
INSERT INTO contacts (
    account_id,
    first_name,
    last_name,
    email,
    phone,
    is_primary,
    created_by,
    created_at,
    updated_at
)
SELECT
    a.account_id,
    -- Split pic_name into first_name (take first word)
    SPLIT_PART(a.pic_name, ' ', 1) AS first_name,
    -- Last name is everything after first word
    CASE
        WHEN POSITION(' ' IN a.pic_name) > 0
        THEN SUBSTRING(a.pic_name FROM POSITION(' ' IN a.pic_name) + 1)
        ELSE NULL
    END AS last_name,
    a.pic_email AS email,
    a.pic_phone AS phone,
    TRUE AS is_primary,
    a.created_by,
    NOW(),
    NOW()
FROM accounts a
WHERE a.pic_name IS NOT NULL
    AND a.pic_name != ''
    AND NOT EXISTS (
        SELECT 1 FROM contacts c WHERE c.account_id = a.account_id
    );

-- 2. Create function to auto-sync PIC to contacts on account insert/update
CREATE OR REPLACE FUNCTION sync_account_pic_to_contact()
RETURNS TRIGGER AS $$
DECLARE
    v_contact_id TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
BEGIN
    -- Only proceed if we have PIC data
    IF NEW.pic_name IS NOT NULL AND NEW.pic_name != '' THEN
        -- Split name into first and last
        v_first_name := SPLIT_PART(NEW.pic_name, ' ', 1);
        v_last_name := CASE
            WHEN POSITION(' ' IN NEW.pic_name) > 0
            THEN SUBSTRING(NEW.pic_name FROM POSITION(' ' IN NEW.pic_name) + 1)
            ELSE NULL
        END;

        -- Check if primary contact already exists for this account
        SELECT contact_id INTO v_contact_id
        FROM contacts
        WHERE account_id = NEW.account_id AND is_primary = TRUE
        LIMIT 1;

        IF v_contact_id IS NOT NULL THEN
            -- Update existing primary contact
            UPDATE contacts SET
                first_name = v_first_name,
                last_name = v_last_name,
                email = COALESCE(NEW.pic_email, email),
                phone = COALESCE(NEW.pic_phone, phone),
                updated_at = NOW()
            WHERE contact_id = v_contact_id;
        ELSE
            -- Create new primary contact
            INSERT INTO contacts (
                account_id,
                first_name,
                last_name,
                email,
                phone,
                is_primary,
                created_by,
                created_at,
                updated_at
            ) VALUES (
                NEW.account_id,
                v_first_name,
                v_last_name,
                NEW.pic_email,
                NEW.pic_phone,
                TRUE,
                NEW.created_by,
                NOW(),
                NOW()
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create trigger to run after account insert or update
DROP TRIGGER IF EXISTS trg_sync_account_pic_to_contact ON accounts;

CREATE TRIGGER trg_sync_account_pic_to_contact
    AFTER INSERT OR UPDATE OF pic_name, pic_email, pic_phone
    ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION sync_account_pic_to_contact();

-- 4. Add comment
COMMENT ON FUNCTION sync_account_pic_to_contact IS 'Auto-sync PIC data from accounts to contacts table';
