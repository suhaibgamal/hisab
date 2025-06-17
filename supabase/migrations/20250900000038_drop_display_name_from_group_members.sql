-- Drop display_name column from group_members table if it exists
ALTER TABLE public.group_members
DROP COLUMN IF EXISTS display_name; 