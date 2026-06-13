-- Change campaigns.traffic_source from enum to text to support all 10 traffic sources
ALTER TABLE public.campaigns 
  ALTER COLUMN traffic_source TYPE text USING traffic_source::text;

-- Drop the old enum type since it's no longer needed
DROP TYPE IF EXISTS public.traffic_source;