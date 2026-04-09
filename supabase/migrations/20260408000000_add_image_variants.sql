-- Add preview_url to all photo tables so the new image pipeline can store
-- a mid-size WebP variant alongside the original (url) and the thumbnail.
-- Existing rows leave preview_url NULL until the backfill function processes them;
-- the frontend falls back to thumbnail_url / url in that case.

ALTER TABLE public.photos          ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE public.portfolio_photos ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE public.homepage_photos  ADD COLUMN IF NOT EXISTS preview_url TEXT;
