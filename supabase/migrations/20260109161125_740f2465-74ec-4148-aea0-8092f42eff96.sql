-- Add humidity_class column to buildups table for storing internal humidity class (1-5)
ALTER TABLE public.buildups ADD COLUMN IF NOT EXISTS humidity_class integer DEFAULT 3;

-- Add constraint to ensure valid humidity class values
ALTER TABLE public.buildups ADD CONSTRAINT humidity_class_valid CHECK (humidity_class >= 1 AND humidity_class <= 5);