-- Migration 184: Backfill ticket_response_metrics NULL values
--
-- Problems found:
-- 1. assignee_first_response_seconds = NULL (first assignee response not tracked)
-- 2. time_to_resolution_seconds = NULL (ticket closed but resolved_at may be NULL)
--
-- This migration:
-- Part 1: Fix tickets.resolved_at for closed/resolved tickets missing it
-- Part 2: Backfill assignee_first_response_seconds from ticket_response_exchanges or ticket_comments
-- Part 3: Backfill time_to_resolution_seconds from tickets.resolved_at

-- ============================================
-- PART 1: Fix tickets.resolved_at for closed/resolved tickets
-- ============================================
-- For tickets that are resolved/closed but have no resolved_at, use updated_at as fallback
UPDATE public.tickets
SET resolved_at = updated_at
WHERE status IN ('resolved', 'closed')
  AND resolved_at IS NULL;

-- ============================================
-- PART 2: Backfill assignee_first_response_seconds
-- ============================================
-- Try from ticket_response_exchanges first (most accurate)
UPDATE public.ticket_response_metrics trm
SET assignee_first_response_seconds = sub.first_response_seconds,
    assignee_first_response_business_seconds = COALESCE(sub.first_business_seconds, sub.first_response_seconds),
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (tre.ticket_id)
        tre.ticket_id,
        tre.raw_response_seconds as first_response_seconds,
        tre.business_response_seconds as first_business_seconds
    FROM public.ticket_response_exchanges tre
    WHERE tre.responder_type = 'assignee'
      AND tre.raw_response_seconds IS NOT NULL
    ORDER BY tre.ticket_id, tre.responded_at ASC
) sub
WHERE trm.ticket_id = sub.ticket_id
  AND trm.assignee_first_response_seconds IS NULL;

-- Fallback: calculate from first assignee comment if no exchange record
UPDATE public.ticket_response_metrics trm
SET assignee_first_response_seconds = sub.first_response_seconds,
    assignee_first_response_business_seconds = sub.first_response_seconds,
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (tc.ticket_id)
        tc.ticket_id,
        EXTRACT(EPOCH FROM (tc.created_at - t.created_at))::INTEGER as first_response_seconds
    FROM public.ticket_comments tc
    JOIN public.tickets t ON t.id = tc.ticket_id
    WHERE tc.user_id = t.assigned_to
      AND tc.is_internal = FALSE
      AND tc.created_at > t.created_at
    ORDER BY tc.ticket_id, tc.created_at ASC
) sub
WHERE trm.ticket_id = sub.ticket_id
  AND trm.assignee_first_response_seconds IS NULL;

-- Last fallback: calculate from first operational cost submission (for RFQ tickets, this IS the assignee's first response)
UPDATE public.ticket_response_metrics trm
SET assignee_first_response_seconds = sub.first_response_seconds,
    assignee_first_response_business_seconds = sub.first_response_seconds,
    updated_at = NOW()
FROM (
    SELECT
        trq.ticket_id,
        EXTRACT(EPOCH FROM (MIN(trq.created_at) - t.created_at))::INTEGER as first_response_seconds
    FROM public.ticket_rate_quotes trq
    JOIN public.tickets t ON t.id = trq.ticket_id
    WHERE trq.status IN ('submitted', 'sent_to_customer', 'accepted')
    GROUP BY trq.ticket_id, t.created_at
) sub
WHERE trm.ticket_id = sub.ticket_id
  AND trm.assignee_first_response_seconds IS NULL;

-- ============================================
-- PART 3: Backfill time_to_resolution_seconds
-- ============================================
UPDATE public.ticket_response_metrics trm
SET time_to_resolution_seconds = EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))::INTEGER,
    time_to_resolution_business_seconds = EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))::INTEGER,
    updated_at = NOW()
FROM public.tickets t
WHERE trm.ticket_id = t.id
  AND t.resolved_at IS NOT NULL
  AND trm.time_to_resolution_seconds IS NULL;
