-- Add meta_description column for SEO meta descriptions
-- Generated alongside ai_bio in a single OpenAI call
ALTER TABLE profiles ADD COLUMN meta_description text;
