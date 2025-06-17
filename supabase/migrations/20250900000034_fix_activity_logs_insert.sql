-- Drop the old function
DROP FUNCTION IF EXISTS public.update_group_settings(
  UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT
);

-- Recreate the function with the correct activity_logs schema
CREATE OR REPLACE FUNCTION public.update_group_settings(
  p_group_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL,
  p_member_limit INTEGER DEFAULT NULL,
  p_invite_code_visible BOOLEAN DEFAULT NULL,
  p_auto_approve_members BOOLEAN DEFAULT NULL,
  p_activity_log_privacy TEXT DEFAULT NULL,
  p_export_control TEXT DEFAULT NULL,
  p_member_list_visibility TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_user_id UUID;
  v_current_role TEXT;
  v_old_settings JSONB;
  v_new_settings JSONB;
BEGIN
  -- Get the current user's ID from auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user's role in the group
  SELECT role INTO v_current_role
  FROM group_members
  WHERE group_id = p_group_id AND user_id = v_user_id;

  -- Check if user is admin
  IF v_current_role != 'admin' THEN
    RAISE EXCEPTION 'Only group admins can update settings';
  END IF;

  -- Get old settings for activity log
  SELECT jsonb_build_object(
    'name', name,
    'description', description,
    'member_limit', member_limit,
    'invite_code_visible', invite_code_visible,
    'auto_approve_members', auto_approve_members,
    'activity_log_privacy', activity_log_privacy,
    'export_control', export_control,
    'member_list_visibility', member_list_visibility,
    'has_password', CASE WHEN password IS NOT NULL THEN true ELSE false END
  ) INTO v_old_settings
  FROM groups
  WHERE id = p_group_id;

  -- Update group settings
  UPDATE groups
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    password = CASE 
      WHEN p_password = '' THEN NULL -- Remove password if empty string
      WHEN p_password IS NOT NULL THEN p_password -- Update password if provided
      ELSE password -- Keep existing password
    END,
    member_limit = COALESCE(p_member_limit, member_limit),
    invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
    auto_approve_members = COALESCE(p_auto_approve_members, auto_approve_members),
    activity_log_privacy = COALESCE(p_activity_log_privacy, activity_log_privacy),
    export_control = COALESCE(p_export_control, export_control),
    member_list_visibility = COALESCE(p_member_list_visibility, member_list_visibility)
  WHERE id = p_group_id;

  -- Get new settings for activity log
  SELECT jsonb_build_object(
    'name', name,
    'description', description,
    'member_limit', member_limit,
    'invite_code_visible', invite_code_visible,
    'auto_approve_members', auto_approve_members,
    'activity_log_privacy', activity_log_privacy,
    'export_control', export_control,
    'member_list_visibility', member_list_visibility,
    'has_password', CASE WHEN password IS NOT NULL THEN true ELSE false END
  ) INTO v_new_settings
  FROM groups
  WHERE id = p_group_id;

  -- Log the activity
  INSERT INTO activity_logs (
    user_id,
    group_id,
    action_type,
    payload
  )
  VALUES (
    v_user_id,
    p_group_id,
    'update_settings',
    jsonb_build_object(
      'old_settings', v_old_settings,
      'new_settings', v_new_settings
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_group_settings(
  UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT
) TO authenticated; 