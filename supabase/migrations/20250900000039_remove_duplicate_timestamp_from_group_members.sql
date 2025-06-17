-- Remove redundant created_at column from group_members table
ALTER TABLE public.group_members
DROP COLUMN IF EXISTS created_at; 