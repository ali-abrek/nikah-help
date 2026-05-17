-- Per-user daily counter for AI bio regeneration. Used by the application
-- to cap actual OpenAI calls at 2 per rolling 24h window. The hash-based
-- short-circuit already prevents no-op edits (e.g. photo-only changes)
-- from incrementing this counter, since they don't reach the OpenAI call.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_bio_regen_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_bio_regen_window_start timestamptz;
