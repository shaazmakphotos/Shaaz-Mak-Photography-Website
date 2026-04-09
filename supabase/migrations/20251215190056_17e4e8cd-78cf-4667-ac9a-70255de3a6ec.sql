-- Fix Albums RLS Policy - Add Expiration Check
DROP POLICY IF EXISTS "Anyone can view album info for shared albums" ON public.albums;
CREATE POLICY "Anyone can view album info for shared albums" ON public.albums
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM share_links
      WHERE share_links.album_id = albums.id
        AND (share_links.expires_at IS NULL OR share_links.expires_at > now())
    )
  );

-- Fix Photos RLS Policy - Add Expiration Check
DROP POLICY IF EXISTS "Anyone can view photos via share links" ON public.photos;
CREATE POLICY "Anyone can view photos via share links" ON public.photos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM share_links sl
      LEFT JOIN shared_photos sp ON sp.share_link_id = sl.id
      WHERE (
        (sl.is_full_album = true AND sl.album_id = photos.album_id)
        OR sp.photo_id = photos.id
      )
      AND (sl.expires_at IS NULL OR sl.expires_at > now())
    )
  );

-- Fix Shared Photos RLS Policy - Remove Public Access, Add Expiration Check
DROP POLICY IF EXISTS "Anyone can view shared photos" ON public.shared_photos;
CREATE POLICY "Anyone can view shared photos via valid share links" ON public.shared_photos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM share_links
      WHERE share_links.id = shared_photos.share_link_id
        AND (share_links.expires_at IS NULL OR share_links.expires_at > now())
    )
  );

-- Fix Share Links RLS Policy - Add policy for public token lookup (needed for validation)
DROP POLICY IF EXISTS "Anyone can validate share link tokens" ON public.share_links;
CREATE POLICY "Anyone can validate share link tokens" ON public.share_links
  FOR SELECT
  USING (
    expires_at IS NULL OR expires_at > now()
  );