-- Add width and height columns to photos table for faster loading
ALTER TABLE public.photos 
ADD COLUMN width integer,
ADD COLUMN height integer;