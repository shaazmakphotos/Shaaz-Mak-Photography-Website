-- Add width and height columns to portfolio_photos for justified gallery layout
ALTER TABLE public.portfolio_photos 
ADD COLUMN width integer,
ADD COLUMN height integer;