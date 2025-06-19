-- MIGRATION to add a SELECT policy to the users table.

-- By default, if RLS is enabled, all access is denied. This policy
-- allows any authenticated user to view profiles in the public.users table.
-- This is necessary for features like the payments list, which needs to
-- join with the users table to display user names.

-- First, drop any existing policy with the same name to make this script re-runnable.
DROP POLICY IF EXISTS "Authenticated users can view all users" ON public.users;

-- Create the new policy.
CREATE POLICY "Authenticated users can view all users"
ON public.users
FOR SELECT
USING ( auth.role() = 'authenticated' ); 