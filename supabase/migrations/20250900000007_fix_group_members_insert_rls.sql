-- Drop existing insert policy
DROP POLICY IF EXISTS "group_members_insert_policy" ON "public"."group_members";

-- Create a new insert policy that allows:
-- 1. Edge Functions to insert members (using service_role)
-- 2. Users to join groups directly if they're authenticated
CREATE POLICY "group_members_insert_policy" ON "public"."group_members"
FOR INSERT
WITH CHECK (
  (
    -- Allow service role (Edge Functions) to insert any membership
    auth.role() = 'service_role'
  ) OR (
    -- Allow authenticated users to insert themselves only
    auth.role() = 'authenticated'
    AND user_id = public.get_current_user_id()
    -- And only if they're not already a member
    AND NOT EXISTS (
      SELECT 1 FROM public.group_members gm2
      WHERE gm2.group_id = group_id
      AND gm2.user_id = public.get_current_user_id()
    )
    -- And only for groups they can join
    AND EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id
      AND (
        -- Public groups
        g.password IS NULL
        -- Or they're the manager
        OR g.manager_id = public.get_current_user_id()
      )
    )
  )
); 