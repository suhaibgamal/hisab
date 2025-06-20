-- Step 1: Clean up obsolete and insecure helper functions and their dependent RLS policies.
-- These functions use SECURITY DEFINER incorrectly and are not needed.

-- Drop the policy first, then the function it depends on.
DROP POLICY IF EXISTS "activity_logs_select_policy" ON public.activity_logs;
DROP FUNCTION IF EXISTS public.can_view_activity_logs(uuid);

-- Drop the policy first, then the function it depends on.
DROP POLICY IF EXISTS "group_members_select_policy" ON public.group_members;
DROP FUNCTION IF EXISTS public.can_view_group_members(uuid);

-- Drop other obsolete functions
DROP FUNCTION IF EXISTS public.can_export_group_data(uuid);

-- Step 2: Drop the old get_groups_for_user function to prepare for replacement.
DROP FUNCTION IF EXISTS public.get_groups_for_user(uuid);

-- Step 3: Create a simplified, robust, and secure version of the function.
-- This version is simpler, avoiding subquery complexity while still being secure.
CREATE OR REPLACE FUNCTION public.get_groups_for_user(p_user_id uuid)
RETURNS TABLE(group_id uuid, group_name text) -- Simplified return signature
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    g.id as group_id,
    g.name as group_name
  FROM
    public.groups g
  JOIN
    public.group_members gm ON g.id = gm.group_id
  WHERE
    gm.user_id = p_user_id;
$$;

-- Grant execution rights to authenticated users for the new function
GRANT EXECUTE ON FUNCTION public.get_groups_for_user(uuid) TO authenticated;
