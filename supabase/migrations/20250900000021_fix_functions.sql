-- Drop existing functions first
DROP FUNCTION IF EXISTS public.create_group_with_manager(text, text, text, uuid);
DROP FUNCTION IF EXISTS public.create_group_with_manager(text, text, text, integer, boolean, boolean, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.update_group_settings(uuid, text, text, text, integer, boolean);
DROP FUNCTION IF EXISTS public.update_group_settings(uuid, text, text, text, integer, boolean, boolean, text, text, text);

-- Recreate create_group_with_manager function
CREATE OR REPLACE FUNCTION public.create_group_with_manager(
  p_group_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_password_hash TEXT DEFAULT NULL,
  p_member_limit INTEGER DEFAULT NULL,
  p_invite_code_visible BOOLEAN DEFAULT true,
  p_auto_approve_members BOOLEAN DEFAULT true,
  p_activity_log_privacy TEXT DEFAULT 'members',
  p_export_control TEXT DEFAULT 'members',
  p_member_list_visibility TEXT DEFAULT 'members',
  p_user_id UUID DEFAULT NULL,
  p_user_display_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_group_id UUID;
  new_invite_code TEXT;
  v_user_id UUID;
BEGIN
  -- Get or set user ID
  IF p_user_id IS NULL THEN
    SELECT public.get_current_user_app_id() INTO v_user_id;
  ELSE
    v_user_id := p_user_id;
  END IF;

  -- Validate settings
  IF p_activity_log_privacy NOT IN ('all', 'members', 'managers') THEN
    RAISE EXCEPTION 'Invalid activity log privacy setting';
  END IF;

  IF p_export_control NOT IN ('all', 'members', 'managers') THEN
    RAISE EXCEPTION 'Invalid export control setting';
  END IF;

  IF p_member_list_visibility NOT IN ('all', 'members', 'managers') THEN
    RAISE EXCEPTION 'Invalid member list visibility setting';
  END IF;

  IF p_member_limit IS NOT NULL AND p_member_limit < 2 THEN
    RAISE EXCEPTION 'Member limit must be at least 2';
  END IF;

  -- Generate a random invite code
  new_invite_code := upper(substring(md5(random()::text) for 8));

  -- Insert the new group
  INSERT INTO public.groups (
    name,
    description,
    password,
    manager_id,
    invite_code,
    member_limit,
    invite_code_visible,
    auto_approve_members,
    activity_log_privacy,
    export_control,
    member_list_visibility
  )
  VALUES (
    p_group_name,
    p_description,
    p_password_hash,
    v_user_id,
    new_invite_code,
    p_member_limit,
    p_invite_code_visible,
    p_auto_approve_members,
    p_activity_log_privacy,
    p_export_control,
    p_member_list_visibility
  )
  RETURNING id INTO new_group_id;

  -- Set the creator as the group manager
  INSERT INTO public.group_members (
    group_id,
    user_id,
    role
  )
  VALUES (
    new_group_id,
    v_user_id,
    'manager'
  );

  -- Log this activity
  INSERT INTO public.activity_logs (
    group_id,
    user_id,
    action_type,
    payload
  )
  VALUES (
    new_group_id,
    v_user_id,
    'group_created',
    jsonb_build_object(
      'groupName', p_group_name,
      'creatorName', p_user_display_name,
      'isPrivate', p_password_hash IS NOT NULL,
      'settings', jsonb_build_object(
        'hasDescription', p_description IS NOT NULL,
        'memberLimit', p_member_limit,
        'inviteCodeVisible', p_invite_code_visible,
        'autoApproveMembers', p_auto_approve_members,
        'privacySettings', jsonb_build_object(
          'activityLog', p_activity_log_privacy,
          'export', p_export_control,
          'memberList', p_member_list_visibility
        )
      )
    )
  );

  RETURN new_group_id;
END;
$$;

-- Recreate update_group_settings function
CREATE OR REPLACE FUNCTION public.update_group_settings(
  p_group_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_password_hash TEXT,
  p_member_limit INTEGER,
  p_invite_code_visible BOOLEAN,
  p_auto_approve_members BOOLEAN,
  p_activity_log_privacy TEXT,
  p_export_control TEXT,
  p_member_list_visibility TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id UUID;
  v_old_password TEXT;
  current_member_count INTEGER;
BEGIN
  -- Get current user's ID
  SELECT public.get_current_user_app_id() INTO v_current_user_id;
  
  -- Check if user is the group manager
  IF NOT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = p_group_id AND manager_id = v_current_user_id
  ) THEN
    RAISE EXCEPTION 'Only the group manager can update settings';
  END IF;

  -- Get the current password and member count
  SELECT 
    password,
    (SELECT COUNT(*) FROM public.group_members WHERE group_id = p_group_id)
  INTO 
    v_old_password,
    current_member_count
  FROM public.groups
  WHERE id = p_group_id;

  -- Validate member limit
  IF p_member_limit IS NOT NULL AND p_member_limit > 0 AND p_member_limit < current_member_count THEN
    RAISE EXCEPTION 'New member limit (%) cannot be less than current member count (%)', p_member_limit, current_member_count;
  END IF;

  -- Validate privacy settings
  IF p_activity_log_privacy IS NOT NULL AND p_activity_log_privacy NOT IN ('all', 'members', 'managers') THEN
    RAISE EXCEPTION 'Invalid activity log privacy setting';
  END IF;

  IF p_export_control IS NOT NULL AND p_export_control NOT IN ('all', 'members', 'managers') THEN
    RAISE EXCEPTION 'Invalid export control setting';
  END IF;

  IF p_member_list_visibility IS NOT NULL AND p_member_list_visibility NOT IN ('all', 'members', 'managers') THEN
    RAISE EXCEPTION 'Invalid member list visibility setting';
  END IF;

  -- Update group settings
  UPDATE public.groups
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    password = COALESCE(p_password_hash, password),
    member_limit = COALESCE(p_member_limit, member_limit),
    invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
    auto_approve_members = COALESCE(p_auto_approve_members, auto_approve_members),
    activity_log_privacy = COALESCE(p_activity_log_privacy, activity_log_privacy),
    export_control = COALESCE(p_export_control, export_control),
    member_list_visibility = COALESCE(p_member_list_visibility, member_list_visibility),
    updated_at = NOW()
  WHERE id = p_group_id;

  -- If password was changed, remove all non-manager members
  IF p_password_hash IS NOT NULL AND p_password_hash IS DISTINCT FROM v_old_password THEN
    DELETE FROM public.group_members
    WHERE group_id = p_group_id AND role <> 'manager';
  END IF;

  -- Log the settings update
  INSERT INTO public.activity_logs (
    group_id,
    user_id,
    action_type,
    payload
  )
  VALUES (
    p_group_id,
    v_current_user_id,
    'group_settings_updated',
    jsonb_build_object(
      'name_changed', p_name IS NOT NULL,
      'description_changed', p_description IS NOT NULL,
      'password_changed', p_password_hash IS NOT NULL,
      'member_limit_changed', p_member_limit IS NOT NULL,
      'privacy_settings_changed', 
      (p_invite_code_visible IS NOT NULL OR 
       p_auto_approve_members IS NOT NULL OR 
       p_activity_log_privacy IS NOT NULL OR 
       p_export_control IS NOT NULL OR 
       p_member_list_visibility IS NOT NULL)
    )
  );
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.create_group_with_manager(
  TEXT, TEXT, TEXT, INTEGER, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, UUID, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_group_settings(
  UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT
) TO authenticated; 