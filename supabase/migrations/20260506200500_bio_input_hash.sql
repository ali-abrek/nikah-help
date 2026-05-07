-- Track which inputs the current ai_bio was generated from so we can skip
-- re-running OpenAI when an edit didn't actually change a bio-relevant
-- field. Stored as a hex SHA-256 of the canonicalised field-set; computed
-- by the application (see lib/profile/bio-fields.ts).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_bio_input_hash text;

-- Status enum needs a `pending` value for the in-flight window between
-- 'edit committed' and 'Inngest worker picked up the regeneration'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'ai_bio_status'
       AND e.enumlabel = 'pending'
  ) THEN
    ALTER TYPE public.ai_bio_status ADD VALUE 'pending';
  END IF;
END $$;
