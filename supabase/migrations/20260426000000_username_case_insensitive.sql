-- Make username lookup case-insensitive at login time.
-- Existing rows keep their original casing — we only change the comparison.
-- "London26", "london26", "LONDON26" all resolve to the same row.

CREATE OR REPLACE FUNCTION public.get_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT email FROM public.profiles
  WHERE LOWER(username) = LOWER(_username)
  LIMIT 1;
$$;
