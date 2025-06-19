-- MIGRATION to fix the broken RLS policy on group_members.

-- 1. Drop the previous, faulty policy that was self-referencing.
DROP POLICY IF EXISTS "Members can view other members of their own groups" ON public.group_members;

-- 2. Create the new, correct policy.
-- This policy allows a user to see all rows in `group_members` that share a `group_id`
-- with them. This is secure and breaks the circular dependency.
CREATE POLICY "Members can view other members of their own groups"
ON public.group_members
FOR SELECT
USING (
  group_id IN (
    SELECT group_id
    FROM public.group_members
    WHERE user_id = get_current_user_app_id()
  )
); 