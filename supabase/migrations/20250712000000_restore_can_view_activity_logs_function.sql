-- Migration: Restore can_view_activity_logs function for activity_logs RLS
-- Date: 2025-07-12

CREATE OR REPLACE FUNCTION public.can_view_activity_logs(group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_privacy TEXT;
BEGIN
  -- Get current user's ID
  SELECT id INTO v_user_id FROM public.users WHERE supabase_auth_id = auth.uid();

  -- Get user's role in the group
  SELECT role INTO v_user_role 
  FROM public.group_members 
  WHERE group_id = $1 AND user_id = v_user_id;

  -- Get group's activity log privacy setting
  SELECT activity_log_privacy INTO v_privacy 
  FROM public.groups 
  WHERE id = $1;

  RETURN 
    CASE v_privacy
      WHEN 'all' THEN true
      WHEN 'members' THEN v_user_role IS NOT NULL
      WHEN 'managers' THEN v_user_role = 'manager'
      ELSE false
    END;
END;
$$;

-- Grant execute to all relevant roles
GRANT EXECUTE ON FUNCTION public.can_view_activity_logs(uuid) TO anon, authenticated, service_role; 