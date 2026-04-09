
-- Add username column to profiles
ALTER TABLE public.profiles ADD COLUMN username text UNIQUE;

-- Create index for fast username lookups
CREATE INDEX idx_profiles_username ON public.profiles(username);

-- Create a security definer function to look up email by username (callable without auth)
CREATE OR REPLACE FUNCTION public.get_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT email FROM public.profiles WHERE username = _username LIMIT 1;
$$;
