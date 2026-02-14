-- =====================================================
-- Migration 193: Seed Social Media Platform Configs
-- Populates marketing_social_media_config with initial
-- platform credentials from known values.
-- =====================================================

-- Facebook: Page Access Token (does not expire)
INSERT INTO marketing_social_media_config (platform, account_id, access_token, api_base_url, is_active)
VALUES (
  'facebook',
  '799721171851419',
  'EAAbdQG1D5dMBQkt7X2yak1yWhFvX2BpMKU7BDF8lKZBC2vrPubrZAspeDLB9yEzBKZCYN3ZAKZAmxT4hfWNBw09NX959Ynl4fl5Bm4sI5KvrX8ZAZBrKKDMxEG6feQ1sS1O4gfhC6lhLaJSDQTZCcISNDZCV46IZAHuAchkDmZBHeMKdVailEUqjyeoXenLLA8ADUaWMgvMQknZBttfW3SStZCzDzPOF5eAAu0olPitx2GJCVF0rya7wa4lZB0YfWdpKZANcVsbQ544xHSRfeL4zhYKll6ZAN1ZB1EDeFpezeWMTgXYgqoFcarkUZBeuLa7ZAyrsLiW2mRQTgZDZD',
  'https://graph.facebook.com/v21.0',
  TRUE
)
ON CONFLICT (platform) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  access_token = EXCLUDED.access_token,
  api_base_url = EXCLUDED.api_base_url,
  is_active = TRUE,
  updated_at = NOW();

-- Instagram: Needs OAuth for IG Business Account ID + token
-- The IG Business Account ID is derived from the Facebook Page
-- User must visit /api/auth/social-media/instagram to connect
INSERT INTO marketing_social_media_config (platform, account_id, access_token, api_base_url, is_active)
VALUES (
  'instagram',
  NULL,
  NULL,
  'https://graph.facebook.com/v21.0',
  FALSE
)
ON CONFLICT (platform) DO NOTHING;

-- YouTube: Channel ID known, needs OAuth for access token
INSERT INTO marketing_social_media_config (platform, account_id, access_token, api_base_url, is_active)
VALUES (
  'youtube',
  'UCTVulbK8gog2lb1CbxSmAbA',
  NULL,
  'https://www.googleapis.com/youtube/v3',
  FALSE
)
ON CONFLICT (platform) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  api_base_url = EXCLUDED.api_base_url,
  updated_at = NOW();

-- TikTok: Needs full OAuth flow
INSERT INTO marketing_social_media_config (platform, account_id, access_token, api_base_url, is_active)
VALUES (
  'tiktok',
  NULL,
  NULL,
  'https://open.tiktokapis.com/v2',
  FALSE
)
ON CONFLICT (platform) DO NOTHING;

-- LinkedIn: Organization ID known, needs OAuth for access token
INSERT INTO marketing_social_media_config (platform, account_id, access_token, api_base_url, is_active)
VALUES (
  'linkedin',
  '10512843',
  NULL,
  'https://api.linkedin.com',
  FALSE
)
ON CONFLICT (platform) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  api_base_url = EXCLUDED.api_base_url,
  updated_at = NOW();

-- Also add service RLS policy so fetch webhook (service_role) can read configs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'marketing_social_media_config'
    AND policyname = 'service_config_select'
  ) THEN
    CREATE POLICY "service_config_select" ON marketing_social_media_config
      FOR SELECT USING (auth.uid() IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'marketing_social_media_config'
    AND policyname = 'service_config_all'
  ) THEN
    CREATE POLICY "service_config_all" ON marketing_social_media_config
      FOR ALL USING (auth.uid() IS NULL);
  END IF;
END $$;
