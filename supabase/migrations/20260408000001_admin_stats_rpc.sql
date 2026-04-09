-- get_admin_stats() returns dashboard counts for the admin panel in a single
-- round trip. Marked SECURITY DEFINER + locked down to admin role only via
-- a guard at the top of the function so non-admins can't call it.

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_albums int;
  v_clients int;
  v_photos int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  SELECT count(*) INTO v_albums  FROM public.albums;
  SELECT count(*) INTO v_clients FROM public.user_roles WHERE role = 'client';
  SELECT
    (SELECT count(*) FROM public.photos)
    + (SELECT count(*) FROM public.portfolio_photos)
    + (SELECT count(*) FROM public.homepage_photos)
  INTO v_photos;

  RETURN jsonb_build_object(
    'albums',  v_albums,
    'clients', v_clients,
    'photos',  v_photos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;
