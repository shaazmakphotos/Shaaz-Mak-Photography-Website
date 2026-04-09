-- Drop the overly permissive policy that exposes all share links
DROP POLICY IF EXISTS "Anyone can view share links by token" ON public.share_links;

-- Create a more restrictive policy that only allows viewing share links when filtering by token
-- This prevents enumeration - users can only access a specific share link if they know the token
CREATE POLICY "View share links only by token filter"
  ON public.share_links
  FOR SELECT
  USING (
    -- Allow if user created the link
    auth.uid() = created_by
    -- Or if the token column is used in the WHERE clause (will be validated at application level)
    -- This allows anonymous users to validate a specific token they have
    OR true
  );

-- Note: Since RLS can't directly restrict to "only when token is in WHERE clause",
-- we need a different approach. The safest is to create an Edge Function for token validation.
-- However, for the SharedAlbum page to work, we need SOME read access.
-- 
-- Better approach: Remove the open policy and create a server-validated endpoint.
-- For now, we'll drop the open policy to stop enumeration and use a more targeted approach.

DROP POLICY IF EXISTS "View share links only by token filter" ON public.share_links;

-- Only allow viewing share links if:
-- 1. User created the link (authenticated owner access)
-- 2. User is an admin
-- Anonymous access to share_links will be handled via an Edge Function
CREATE POLICY "Authenticated users can view their own share links"
  ON public.share_links
  FOR SELECT
  USING (
    auth.uid() = created_by 
    OR has_role(auth.uid(), 'admin'::app_role)
  );