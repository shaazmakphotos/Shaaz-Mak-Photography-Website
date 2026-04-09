-- Allow public access to share_links by token (for viewing shared albums)
CREATE POLICY "Anyone can view share links by token"
  ON public.share_links FOR SELECT
  USING (true);

-- Allow public access to view shared photos
CREATE POLICY "Anyone can view shared photos"
  ON public.shared_photos FOR SELECT
  USING (true);

-- Allow public access to view photos that are shared
CREATE POLICY "Anyone can view photos via share links"
  ON public.photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.share_links sl
      LEFT JOIN public.shared_photos sp ON sp.share_link_id = sl.id
      WHERE (sl.is_full_album = true AND sl.album_id = photos.album_id)
         OR (sp.photo_id = photos.id)
    )
  );

-- Allow public access to album titles for shared albums
CREATE POLICY "Anyone can view album info for shared albums"
  ON public.albums FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.share_links
      WHERE share_links.album_id = albums.id
    )
  );