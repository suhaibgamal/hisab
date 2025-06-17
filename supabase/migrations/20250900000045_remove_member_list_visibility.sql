-- Drop all versions of the function
DROP FUNCTION IF EXISTS public.update_group_settings(uuid, text, text, text, integer, boolean, boolean, privacy_level, privacy_level);
DROP FUNCTION IF EXISTS public.update_group_settings(uuid, text, text, text, integer, boolean, boolean, text, text, text);

-- Recreate the function without member_list_visibility
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
  v_old_password text;
  current_member_count integer;
BEGIN
  -- Get current user's ID
  SELECT public.get_current_user_app_id() INTO v_current_user_id;
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Check if user is a manager of the group
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
    AND user_id = v_current_user_id
    AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Only managers can update group settings';
  END IF;

  -- Get current member count
  SELECT COUNT(*) INTO current_member_count
  FROM group_members
  WHERE group_id = p_group_id;

  -- Validate member limit
  IF p_member_limit IS NOT NULL AND p_member_limit < current_member_count THEN
    RAISE EXCEPTION 'Member limit cannot be less than current member count';
  END IF;

  -- Get old password for comparison
  SELECT password INTO v_old_password
  FROM groups
  WHERE id = p_group_id;

  -- Update group settings
  UPDATE groups
  SET
    name = COALESCE(p_name, name),
    description = p_description,
    password = COALESCE(p_password_hash, password),
    member_limit = COALESCE(p_member_limit, member_limit),
    invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
    auto_approve_members = COALESCE(p_auto_approve_members, auto_approve_members),
    activity_log_privacy = COALESCE(p_activity_log_privacy, activity_log_privacy),
    export_control = COALESCE(p_export_control, export_control)
  WHERE id = p_group_id;

  -- If password was changed, remove all non-manager members for security
  IF p_password_hash IS NOT NULL AND p_password_hash != v_old_password THEN
    DELETE FROM group_members
    WHERE group_id = p_group_id
    AND role != 'manager';
  END IF;

  -- Log the settings update
  INSERT INTO activity_logs (group_id, user_id, action_type, payload)
  VALUES (
    p_group_id,
    v_current_user_id,
    'group_settings_updated',
    jsonb_build_object(
      'name', p_name,
      'description', p_description,
      'member_limit', p_member_limit,
      'invite_code_visible', p_invite_code_visible,
      'auto_approve_members', p_auto_approve_members,
      'activity_log_privacy', p_activity_log_privacy,
      'export_control', p_export_control,
      'password_changed', p_password_hash IS NOT NULL
    )
  );
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.update_group_settings(
  uuid, text, text, text, integer, boolean, boolean, privacy_level, privacy_level
) TO authenticated; 