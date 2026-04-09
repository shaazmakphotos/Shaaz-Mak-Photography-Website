-- Create portfolio_photos table
CREATE TABLE public.portfolio_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  category TEXT NOT NULL DEFAULT 'Weddings',
  alt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.portfolio_photos ENABLE ROW LEVEL SECURITY;

-- Anyone can view portfolio photos (public page)
CREATE POLICY "Anyone can view portfolio photos"
ON public.portfolio_photos
FOR SELECT
USING (true);

-- Only admins can manage portfolio photos
CREATE POLICY "Admins can manage portfolio photos"
ON public.portfolio_photos
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));