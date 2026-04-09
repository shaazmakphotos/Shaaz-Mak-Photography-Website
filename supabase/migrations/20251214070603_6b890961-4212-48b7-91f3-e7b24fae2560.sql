-- Create homepage_photos table for admin-managed featured work
CREATE TABLE public.homepage_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  alt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.homepage_photos ENABLE ROW LEVEL SECURITY;

-- Admins can manage homepage photos
CREATE POLICY "Admins can manage homepage photos" ON public.homepage_photos
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can view homepage photos (public homepage)
CREATE POLICY "Anyone can view homepage photos" ON public.homepage_photos
  FOR SELECT USING (true);