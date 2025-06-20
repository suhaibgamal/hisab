-- Step 1: Create a helper function to check group membership
-- This function runs with the permissions of the user who defined it (postgres)
-- and can therefore bypass RLS to check for a user's membership in a specific group.
CREATE OR REPLACE FUNCTION public.is_member_of(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$;

-- Grant execution rights to authenticated users
GRANT EXECUTE ON FUNCTION public.is_member_of(uuid, uuid) TO authenticated;


-- Step 2: Update the RLS policy for selecting group members
-- First, drop the old policy if it exists, to prevent conflicts.
DROP POLICY IF EXISTS "Allow authenticated users to see members of their own groups" ON public.group_members;

-- Create the new, correct policy.
-- This allows a user to see records in `group_members` if they are a member of that same group.
-- It uses the `is_member_of` helper to securely check this condition without causing a recursive loop.
CREATE POLICY "Allow authenticated users to see members of their own groups"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  public.is_member_of(group_id, (SELECT id FROM users WHERE supabase_auth_id = auth.uid()))
);


-- Step 3: Update the RLS policy for selecting groups
-- Drop the old policy to replace it.
DROP POLICY IF EXISTS "Allow authenticated users to see their own groups" ON public.groups;

-- Create the new, correct policy.
-- This allows a user to see a group if they are a member of it.
CREATE POLICY "Allow authenticated users to see their own groups"
ON public.groups
FOR SELECT
TO authenticated
USING (
  public.is_member_of(id, (SELECT id FROM users WHERE supabase_auth_id = auth.uid()))
);
