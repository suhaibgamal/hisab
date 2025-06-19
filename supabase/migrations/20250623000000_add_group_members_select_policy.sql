-- MIGRATION to add RLS policy for reading group members.

-- This policy was missing, which prevented users from seeing any data
-- in tables (like transactions) that checked for group membership.

-- Allow users to see other members of groups they belong to.
CREATE POLICY "Members can view other members of their own groups"
ON public.group_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = group_members.group_id
    AND user_id = get_current_user_app_id()
  )
); 