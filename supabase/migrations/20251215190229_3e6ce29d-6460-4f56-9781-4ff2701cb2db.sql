-- Remove overly permissive share_links policy - edge function uses service role key
DROP POLICY IF EXISTS "Anyone can validate share link tokens" ON public.share_links;