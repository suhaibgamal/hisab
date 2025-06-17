-- Drop unused columns
ALTER TABLE public.groups
  DROP COLUMN IF EXISTS max_members,
  DROP COLUMN IF EXISTS is_public,
  DROP COLUMN IF EXISTS member_list_visibility;

-- Create ENUM type for privacy settings
DO $$ BEGIN
  CREATE TYPE privacy_level AS ENUM ('all', 'managers');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update existing privacy settings to use new values
UPDATE public.groups
SET activity_log_privacy = 'managers'
WHERE activity_log_privacy = 'members';

UPDATE public.groups
SET export_control = 'managers'
WHERE export_control = 'members';

-- Add temporary columns with new type
ALTER TABLE public.groups
  ADD COLUMN activity_log_privacy_new privacy_level,
  ADD COLUMN export_control_new privacy_level;

-- Copy data to new columns
UPDATE public.groups
SET 
  activity_log_privacy_new = activity_log_privacy::privacy_level,
  export_control_new = export_control::privacy_level;

-- Drop old columns
ALTER TABLE public.groups DROP COLUMN activity_log_privacy;
ALTER TABLE public.groups DROP COLUMN export_control;

-- Rename new columns
ALTER TABLE public.groups RENAME COLUMN activity_log_privacy_new TO activity_log_privacy;
ALTER TABLE public.groups RENAME COLUMN export_control_new TO export_control;

-- Set defaults for the new columns
ALTER TABLE public.groups ALTER COLUMN activity_log_privacy SET DEFAULT 'managers'::privacy_level;
ALTER TABLE public.groups ALTER COLUMN export_control SET DEFAULT 'managers'::privacy_level;

-- Drop and recreate functions to use new privacy settings
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
       p_export_control IS NOT NULL)
    )
  );
END;
$$;

-- Update create_group_with_manager function
CREATE OR REPLACE FUNCTION public.create_group_with_manager(
  p_group_name text,
  p_description text,
  p_password_hash text DEFAULT NULL,
  p_member_limit integer DEFAULT NULL,
  p_invite_code_visible boolean DEFAULT true,
  p_auto_approve_members boolean DEFAULT true,
  p_activity_log_privacy privacy_level DEFAULT 'managers'::privacy_level,
  p_export_control privacy_level DEFAULT 'managers'::privacy_level,
  p_user_id uuid DEFAULT NULL,
  p_user_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_group_id uuid;
  new_invite_code text;
  v_user_id uuid;
BEGIN
  -- Get or set user ID
  IF p_user_id IS NULL THEN
    SELECT public.get_current_user_app_id() INTO v_user_id;
  ELSE
    v_user_id := p_user_id;
  END IF;

  -- Validate member limit
  IF p_member_limit IS NOT NULL AND p_member_limit < 2 THEN
    RAISE EXCEPTION 'Member limit must be at least 2';
  END IF;

  -- Generate unique invite code
  LOOP
    new_invite_code := substr(md5(random()::text), 1, 8);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.groups WHERE invite_code = new_invite_code);
  END LOOP;

  -- Create the group
  INSERT INTO public.groups (
    name,
    description,
    invite_code,
    password,
    member_limit,
    manager_id,
    invite_code_visible,
    auto_approve_members,
    activity_log_privacy,
    export_control
  )
  VALUES (
    p_group_name,
    p_description,
    new_invite_code,
    p_password_hash,
    p_member_limit,
    v_user_id,
    p_invite_code_visible,
    p_auto_approve_members,
    p_activity_log_privacy,
    p_export_control
  )
  RETURNING id INTO new_group_id;

  -- Add the creator as a manager
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

  -- Log group creation
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
          'export', p_export_control
        )
      )
    )
  );

  RETURN new_group_id;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.update_group_settings(
  uuid, text, text, text, integer, boolean, boolean, privacy_level, privacy_level
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_group_with_manager(
  text, text, text, integer, boolean, boolean, privacy_level, privacy_level, uuid, text
) TO authenticated; 