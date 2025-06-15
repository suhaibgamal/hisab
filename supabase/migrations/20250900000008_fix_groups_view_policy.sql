-- Drop existing view policy
DROP POLICY IF EXISTS "groups_view_policy" ON "public"."groups";

-- Create new view policy that allows:
-- 1. Viewing public groups
-- 2. Viewing private groups if you're a member
-- 3. Viewing private groups if you have the correct group ID (for joining)
CREATE POLICY "groups_view_policy" ON "public"."groups"
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND (
    -- You're the manager
    manager_id = auth.uid()
    OR
    -- You're a member
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = id
      AND gm.user_id = (
        SELECT id FROM public.users 
        WHERE supabase_auth_id = auth.uid()
        LIMIT 1
      )
    )
    OR
    -- Public groups
    password IS NULL
    OR
    -- Private groups when accessed directly (for joining)
    id::text = current_setting('request.jwt.claims')::json->>'group_id'
  )
); 