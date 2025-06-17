-- Create the update_group_settings function
CREATE OR REPLACE FUNCTION public.update_group_settings(
  p_group_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
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
BEGIN
  -- Get the current user's ID from auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the user's role in the group
  SELECT role INTO v_current_role
  FROM group_members
  WHERE group_id = p_group_id
  AND users.id = (SELECT id FROM users WHERE supabase_auth_id = v_user_id);

  -- Check if user is a manager
  IF v_current_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can update group settings';
  END IF;

  -- Update the group settings
  UPDATE groups
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    password_hash = CASE 
      WHEN p_password_hash IS NOT NULL THEN p_password_hash 
      ELSE password_hash 
    END,
    member_limit = COALESCE(p_member_limit, member_limit),
    invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
    auto_approve_members = COALESCE(p_auto_approve_members, auto_approve_members),
    activity_log_privacy = COALESCE(p_activity_log_privacy, activity_log_privacy),
    export_control = COALESCE(p_export_control, export_control),
    member_list_visibility = COALESCE(p_member_list_visibility, member_list_visibility),
    updated_at = NOW()
  WHERE id = p_group_id;

  -- If password was changed, remove all non-manager members for security
  IF p_password_hash IS NOT NULL THEN
    DELETE FROM group_members
    WHERE group_id = p_group_id
    AND role != 'manager';
  END IF;

  -- Log the activity
  INSERT INTO activity_logs (
    group_id,
    user_id,
    action_type,
    description
  ) VALUES (
    p_group_id,
    (SELECT id FROM users WHERE supabase_auth_id = v_user_id),
    'group_settings_updated',
    'تم تحديث إعدادات المجموعة'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 