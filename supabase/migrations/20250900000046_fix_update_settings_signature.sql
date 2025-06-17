-- Drop all versions of the function
DO $$ 
DECLARE 
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT ns.nspname as schema_name,
               p.proname as function_name,
               pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace ns ON p.pronamespace = ns.oid
        WHERE ns.nspname = 'public' 
        AND p.proname = 'update_group_settings'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.schema_name || '.' || func_record.function_name || '(' || func_record.args || ') CASCADE';
    END LOOP;
END $$;

-- Recreate the function with safe password handling
CREATE OR REPLACE FUNCTION public.update_group_settings(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_password_hash text,
  p_member_limit integer,
  p_invite_code_visible boolean,
  p_auto_approve_members boolean,
  p_activity_log_privacy privacy_level,
  p_export_control privacy_level
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid;
  v_user_role text;
BEGIN
  -- Get current user's ID from auth.uid()
  v_current_user_id := auth.uid();
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user's role in the group
  SELECT role INTO v_user_role
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  WHERE u.supabase_auth_id = v_current_user_id
  AND gm.group_id = p_group_id;

  -- Check if user is a manager
  IF v_user_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can update group settings';
  END IF;

  -- Validate inputs
  IF p_name IS NULL OR length(trim(p_name)) < 3 OR length(trim(p_name)) > 50 THEN
    RAISE EXCEPTION 'Group name must be between 3 and 50 characters';
  END IF;

  IF p_description IS NOT NULL AND length(trim(p_description)) > 500 THEN
    RAISE EXCEPTION 'Description must not exceed 500 characters';
  END IF;

  IF p_member_limit IS NOT NULL AND (p_member_limit < 2 OR p_member_limit > 100) THEN
    RAISE EXCEPTION 'Member limit must be between 2 and 100';
  END IF;

  -- Update group settings
  UPDATE groups
  SET 
    name = trim(p_name),
    description = CASE 
      WHEN p_description IS NULL THEN description
      ELSE trim(p_description)
    END,
    member_limit = COALESCE(p_member_limit, member_limit),
    invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
    auto_approve_members = COALESCE(p_auto_approve_members, auto_approve_members),
    activity_log_privacy = COALESCE(p_activity_log_privacy, activity_log_privacy),
    export_control = COALESCE(p_export_control, export_control),
    updated_at = now()
  WHERE id = p_group_id;

  -- Only update password if a new one is provided
  IF p_password_hash IS NOT NULL THEN
    UPDATE groups
    SET password_hash = p_password_hash
    WHERE id = p_group_id;

    -- Remove all non-manager members for security
    DELETE FROM group_members
    WHERE group_id = p_group_id
    AND role != 'manager';
  END IF;

  -- Log the activity
  INSERT INTO activity_logs (
    group_id,
    user_id,
    action_type,
    payload
  )
  SELECT 
    p_group_id,
    u.id,
    'update_settings',
    jsonb_build_object(
      'changed_fields', jsonb_build_array(
        CASE WHEN p_password_hash IS NOT NULL THEN 'password' ELSE NULL END,
        CASE WHEN p_member_limit IS NOT NULL THEN 'member_limit' ELSE NULL END,
        CASE WHEN p_invite_code_visible IS NOT NULL THEN 'invite_code_visible' ELSE NULL END,
        CASE WHEN p_auto_approve_members IS NOT NULL THEN 'auto_approve_members' ELSE NULL END,
        CASE WHEN p_activity_log_privacy IS NOT NULL THEN 'activity_log_privacy' ELSE NULL END,
        CASE WHEN p_export_control IS NOT NULL THEN 'export_control' ELSE NULL END
      ) - jsonb '[]'::jsonb
    )
  FROM users u
  WHERE u.supabase_auth_id = v_current_user_id;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.update_group_settings(
  uuid, text, text, text, integer, boolean, boolean, privacy_level, privacy_level
) TO authenticated; 