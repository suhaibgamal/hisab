-- Migration: Fix infinite recursion in group_members RLS policy

-- 1. Drop any existing recursive or faulty policies
DROP POLICY IF EXISTS "Members can view other members of their own groups" ON public.group_members;
DROP POLICY IF EXISTS "Allow authenticated users to see members of their own groups" ON public.group_members;

-- 2. Create a SECURITY DEFINER helper function for membership check
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

GRANT EXECUTE ON FUNCTION public.is_member_of(uuid, uuid) TO authenticated;

-- 3. Add the correct RLS policy using the helper function
CREATE POLICY "Allow authenticated users to see members of their own groups"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  public.is_member_of(group_id, (SELECT id FROM users WHERE supabase_auth_id = auth.uid()))
); 