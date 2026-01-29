-- ============================================
-- Migration: 110_fix_opportunity_creation_sync.sql
--
-- PURPOSE: Ensure complete data synchronization when opportunities are created
--
-- FIXES:
-- 1. Create initial pipeline_updates record when opportunity is created
-- 2. Create initial activities record when opportunity is created
-- 3. Ensure leads.opportunity_id is set when opportunity is created from lead
-- 4. Sync original_creator_id to opportunity from lead
--
-- DATA FLOW:
-- Lead (created_by) → Opportunity (original_creator_id, created_by)
-- Lead (lead_id) ← → Opportunity (source_lead_id)
-- Account ← → Opportunity (account_id)
-- Opportunity → Pipeline Updates
-- Opportunity → Activities
--
-- IDEMPOTENCY: Safe to re-run (DROP + CREATE pattern)
-- ============================================

-- ============================================
-- PART 1: Function to create initial records on opportunity creation
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_opportunity_create_initial_records()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID;
    v_lead_created_by UUID;
    v_activity_exists BOOLEAN;
    v_pipeline_update_exists BOOLEAN;
BEGIN
    -- Get the actor (creator) of the opportunity
    v_actor_id := COALESCE(NEW.created_by, auth.uid());

    -- If opportunity has source_lead_id, sync the relationship bidirectionally
    IF NEW.source_lead_id IS NOT NULL THEN
        -- Get lead's created_by for original_creator_id propagation
        SELECT created_by INTO v_lead_created_by
        FROM public.leads
        WHERE lead_id = NEW.source_lead_id;

        -- Update opportunity with original_creator_id if not already set
        IF NEW.original_creator_id IS NULL AND v_lead_created_by IS NOT NULL THEN
            UPDATE public.opportunities
            SET original_creator_id = v_lead_created_by
            WHERE opportunity_id = NEW.opportunity_id
            AND original_creator_id IS NULL;
        END IF;

        -- Update lead with opportunity_id if this is the first opportunity
        UPDATE public.leads
        SET
            opportunity_id = COALESCE(opportunity_id, NEW.opportunity_id),
            updated_at = NOW()
        WHERE lead_id = NEW.source_lead_id
        AND (opportunity_id IS NULL OR opportunity_id = NEW.opportunity_id);
    END IF;

    -- Check if initial pipeline_update already exists (idempotency)
    SELECT EXISTS(
        SELECT 1 FROM public.pipeline_updates
        WHERE opportunity_id = NEW.opportunity_id
        AND new_stage = NEW.stage
        AND old_stage IS NULL
        AND created_at > NOW() - INTERVAL '1 minute'
    ) INTO v_pipeline_update_exists;

    -- Create initial pipeline_update record (only if not exists)
    IF NOT v_pipeline_update_exists THEN
        INSERT INTO public.pipeline_updates (
            opportunity_id,
            notes,
            approach_method,
            old_stage,
            new_stage,
            updated_by,
            updated_at,
            created_at
        ) VALUES (
            NEW.opportunity_id,
            'Pipeline created' || CASE WHEN NEW.source_lead_id IS NOT NULL THEN ' from lead' ELSE '' END,
            'Email'::approach_method,
            NULL, -- No old stage for initial creation
            NEW.stage,
            v_actor_id,
            NOW(),
            NOW()
        );
    END IF;

    -- Check if initial activity already exists (idempotency)
    SELECT EXISTS(
        SELECT 1 FROM public.activities
        WHERE related_opportunity_id = NEW.opportunity_id
        AND subject LIKE 'Pipeline Created%'
        AND created_at > NOW() - INTERVAL '1 minute'
    ) INTO v_activity_exists;

    -- Create initial activity record (only if not exists)
    IF NOT v_activity_exists THEN
        INSERT INTO public.activities (
            activity_type,
            subject,
            description,
            status,
            due_date,
            completed_at,
            related_opportunity_id,
            related_lead_id,
            related_account_id,
            owner_user_id,
            created_by
        ) VALUES (
            'Note'::activity_type_v2,
            'Pipeline Created: ' || NEW.name,
            'New pipeline opportunity created' ||
                CASE WHEN NEW.source_lead_id IS NOT NULL THEN ' from lead conversion' ELSE '' END ||
                '. Initial stage: ' || NEW.stage ||
                '. Estimated value: ' || COALESCE(NEW.estimated_value::TEXT, '0') || ' ' || COALESCE(NEW.currency, 'IDR'),
            'Completed'::activity_status,
            CURRENT_DATE,
            NOW(),
            NEW.opportunity_id,
            NEW.source_lead_id,
            NEW.account_id,
            COALESCE(NEW.owner_user_id, v_actor_id),
            v_actor_id
        );
    END IF;

    -- Create initial stage history record (only if not exists)
    -- Note: There's already a trigger for UPDATE stage changes,
    -- but we need one for initial INSERT as well
    INSERT INTO public.opportunity_stage_history (
        opportunity_id,
        from_stage,
        to_stage,
        changed_by,
        reason,
        notes,
        old_stage,
        new_stage
    )
    SELECT
        NEW.opportunity_id,
        NULL, -- No from_stage for initial creation
        NEW.stage,
        v_actor_id,
        'opportunity_created',
        'Pipeline created with initial stage: ' || NEW.stage,
        NULL,
        NEW.stage
    WHERE NOT EXISTS (
        SELECT 1 FROM public.opportunity_stage_history
        WHERE opportunity_id = NEW.opportunity_id
        AND from_stage IS NULL
        AND to_stage = NEW.stage
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the opportunity creation
        RAISE WARNING 'Error in fn_opportunity_create_initial_records: %, SQLSTATE: %', SQLERRM, SQLSTATE;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_opportunity_create_initial_records IS
'Creates initial pipeline_updates, activities, and stage_history records when opportunity is created.
Also handles bidirectional sync between leads and opportunities (leads.opportunity_id ↔ opportunities.source_lead_id).
All inserts are idempotent to prevent duplicates if trigger fires multiple times.';

-- ============================================
-- PART 2: Create trigger for opportunity INSERT
-- ============================================

-- Drop existing trigger if exists (idempotency)
DROP TRIGGER IF EXISTS trg_opportunity_create_initial_records ON public.opportunities;

-- Create the trigger
CREATE TRIGGER trg_opportunity_create_initial_records
    AFTER INSERT ON public.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_opportunity_create_initial_records();

-- ============================================
-- PART 3: Function to ensure account status is properly synced
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_sync_account_on_opportunity_create()
RETURNS TRIGGER AS $$
BEGIN
    -- If account is failed_account or null, update to calon_account
    -- This happens when a new opportunity is created for an account
    UPDATE public.accounts
    SET
        account_status = CASE
            WHEN account_status IS NULL OR account_status = 'failed_account'
            THEN 'calon_account'
            ELSE account_status
        END,
        updated_at = NOW()
    WHERE account_id = NEW.account_id
    AND (account_status IS NULL OR account_status = 'failed_account');

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in fn_sync_account_on_opportunity_create: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_sync_account_on_opportunity_create IS
'Updates account status to calon_account when a new opportunity is created,
but only if account was failed_account or null. Does not downgrade active accounts.';

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_account_on_opportunity_create ON public.opportunities;

-- Create the trigger
CREATE TRIGGER trg_sync_account_on_opportunity_create
    AFTER INSERT ON public.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_account_on_opportunity_create();

-- ============================================
-- PART 4: Backfill missing pipeline_updates for existing opportunities
-- ============================================

-- Insert initial pipeline_updates for opportunities that don't have any
INSERT INTO public.pipeline_updates (
    opportunity_id,
    notes,
    approach_method,
    old_stage,
    new_stage,
    updated_by,
    updated_at,
    created_at
)
SELECT
    o.opportunity_id,
    'Pipeline created (backfilled)',
    'Email'::approach_method,
    NULL,
    COALESCE(
        (SELECT h.to_stage FROM public.opportunity_stage_history h
         WHERE h.opportunity_id = o.opportunity_id
         ORDER BY h.changed_at ASC LIMIT 1),
        o.stage
    ),
    COALESCE(o.created_by, o.owner_user_id),
    o.created_at,
    o.created_at
FROM public.opportunities o
WHERE NOT EXISTS (
    SELECT 1 FROM public.pipeline_updates pu
    WHERE pu.opportunity_id = o.opportunity_id
    AND pu.old_stage IS NULL
);

-- ============================================
-- PART 5: Backfill missing activities for existing opportunities
-- ============================================

-- Insert initial activities for opportunities that don't have creation activities
INSERT INTO public.activities (
    activity_type,
    subject,
    description,
    status,
    due_date,
    completed_at,
    related_opportunity_id,
    related_lead_id,
    related_account_id,
    owner_user_id,
    created_by,
    created_at
)
SELECT
    'Note'::activity_type_v2,
    'Pipeline Created: ' || o.name,
    'Pipeline opportunity created (backfilled). Initial stage: ' ||
        COALESCE(
            (SELECT h.to_stage::TEXT FROM public.opportunity_stage_history h
             WHERE h.opportunity_id = o.opportunity_id
             ORDER BY h.changed_at ASC LIMIT 1),
            o.stage::TEXT
        ),
    'Completed'::activity_status,
    o.created_at::DATE,
    o.created_at,
    o.opportunity_id,
    o.source_lead_id,
    o.account_id,
    COALESCE(o.owner_user_id, o.created_by),
    COALESCE(o.created_by, o.owner_user_id),
    o.created_at
FROM public.opportunities o
WHERE NOT EXISTS (
    SELECT 1 FROM public.activities a
    WHERE a.related_opportunity_id = o.opportunity_id
    AND a.subject LIKE 'Pipeline Created%'
);

-- ============================================
-- PART 6: Backfill missing opportunity_stage_history for initial stage
-- ============================================

-- Insert initial stage history for opportunities missing it
INSERT INTO public.opportunity_stage_history (
    opportunity_id,
    from_stage,
    to_stage,
    changed_by,
    changed_at,
    reason,
    notes,
    old_stage,
    new_stage
)
SELECT
    o.opportunity_id,
    NULL,
    COALESCE(
        (SELECT h.to_stage FROM public.opportunity_stage_history h
         WHERE h.opportunity_id = o.opportunity_id
         ORDER BY h.changed_at ASC LIMIT 1),
        o.stage
    ),
    COALESCE(o.created_by, o.owner_user_id),
    o.created_at,
    'opportunity_created',
    'Pipeline created with initial stage (backfilled)',
    NULL,
    COALESCE(
        (SELECT h.to_stage FROM public.opportunity_stage_history h
         WHERE h.opportunity_id = o.opportunity_id
         ORDER BY h.changed_at ASC LIMIT 1),
        o.stage
    )
FROM public.opportunities o
WHERE NOT EXISTS (
    SELECT 1 FROM public.opportunity_stage_history h
    WHERE h.opportunity_id = o.opportunity_id
    AND h.from_stage IS NULL
);

-- ============================================
-- PART 7: Backfill original_creator_id from leads
-- ============================================

-- Update opportunities that have source_lead_id but missing original_creator_id
UPDATE public.opportunities o
SET original_creator_id = l.created_by
FROM public.leads l
WHERE o.source_lead_id = l.lead_id
AND o.original_creator_id IS NULL
AND l.created_by IS NOT NULL;

-- ============================================
-- PART 8: Sync leads.opportunity_id for bidirectional reference
-- ============================================

-- For leads that have opportunities referencing them but don't have opportunity_id set
UPDATE public.leads l
SET
    opportunity_id = (
        SELECT o.opportunity_id
        FROM public.opportunities o
        WHERE o.source_lead_id = l.lead_id
        ORDER BY o.created_at ASC
        LIMIT 1
    ),
    updated_at = NOW()
WHERE l.opportunity_id IS NULL
AND EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.source_lead_id = l.lead_id
);

-- ============================================
-- SUMMARY
-- ============================================
-- This migration ensures complete data synchronization for pipeline/opportunity management:
--
-- 1. TRIGGERS:
--    - trg_opportunity_create_initial_records: Creates pipeline_updates, activities,
--      and stage_history when opportunity is created
--    - trg_sync_account_on_opportunity_create: Updates account status when opportunity is created
--
-- 2. BIDIRECTIONAL SYNC:
--    - leads.opportunity_id ↔ opportunities.source_lead_id
--    - leads.created_by → opportunities.original_creator_id
--
-- 3. BACKFILLS:
--    - Missing pipeline_updates for existing opportunities
--    - Missing activities for existing opportunities
--    - Missing initial stage_history records
--    - Missing original_creator_id from leads
--    - Missing leads.opportunity_id references
--
-- DATA FLOW DIAGRAM:
-- ┌─────────┐     ┌──────────────┐     ┌──────────┐
-- │  Lead   │────→│  Opportunity │────→│ Account  │
-- │         │←────│              │←────│          │
-- │created_by│    │original_     │     │account_  │
-- │lead_id  │    │creator_id    │     │status    │
-- │opportunity_id │source_lead_id│     │          │
-- └─────────┘     └──────────────┘     └──────────┘
--                        │
--                        ├────→ pipeline_updates
--                        ├────→ activities
--                        └────→ opportunity_stage_history
-- ============================================
