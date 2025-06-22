-- Migration: Ensure group password is cleared when privacy is set to public
-- Date: 2025-07-05

CREATE OR REPLACE FUNCTION public.update_group_settings_securely(
  p_group_id uuid,
  p_user_id uuid,
  p_name text,
  p_description text,
  p_password text,
  p_member_limit integer,
  p_invite_code_visible boolean,
  p_activity_log_privacy text,
  p_export_control text,
  p_privacy_level text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_internal_user_id UUID;
  v_current_member_count INT;
  v_hashed_password TEXT;
  v_updated_group JSONB;
BEGIN
  -- 1. Get internal user ID from the Supabase Auth ID
  SELECT id INTO v_internal_user_id FROM public.users WHERE supabase_auth_id = p_user_id;
  IF v_internal_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found in the system.';
  END IF;

  -- 2. Authorization: Check if the calling user is a manager of the group
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = v_internal_user_id AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'User is not authorized to update this group''s settings.';
  END IF;

  -- 3. Validation
  IF p_name IS NOT NULL AND (LENGTH(p_name) < 3 OR LENGTH(p_name) > 50) THEN
    RAISE EXCEPTION 'Group name must be between 3 and 50 characters.';
  END IF;

  IF p_member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_member_count FROM public.group_members WHERE group_id = p_group_id;
    IF p_member_limit < v_current_member_count THEN
      RAISE EXCEPTION 'Member limit cannot be less than the current number of members (%).', v_current_member_count;
    END IF;
  END IF;

  -- 4. Password logic
  IF p_privacy_level = 'public' THEN
    v_hashed_password := NULL;
  ELSIF p_password IS NOT NULL AND p_password != '' THEN
    v_hashed_password := crypt(p_password, gen_salt('bf'));
  ELSE
    SELECT password INTO v_hashed_password FROM public.groups WHERE id = p_group_id;
  END IF;

  -- 5. Update the group settings, casting to the correct ENUM types
  UPDATE public.groups
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    password = v_hashed_password,
    member_limit = COALESCE(p_member_limit, member_limit),
    invite_code_visible = COALESCE(p_invite_code_visible, invite_code_visible),
    activity_log_privacy = COALESCE(p_activity_log_privacy::public.visibility_level, activity_log_privacy),
    export_control = COALESCE(p_export_control::public.visibility_level, export_control),
    privacy_level = COALESCE(p_privacy_level::public.privacy_level, privacy_level)
  WHERE id = p_group_id
  RETURNING row_to_json(groups.*) INTO v_updated_group;

  -- 6. Log the activity
  INSERT INTO public.activity_logs (group_id, user_id, action_type, payload)
  VALUES (p_group_id, v_internal_user_id, 'update_settings', '{}'::jsonb);

  -- 7. Return the updated group data
  RETURN v_updated_group;
END;
$$;

-- Migration: Fix join_group_securely to require password for private groups
-- Date: 2025-07-05

DROP FUNCTION IF EXISTS public.join_group_securely(uuid, text, text);

CREATE OR REPLACE FUNCTION public.join_group_securely(
  p_user_id uuid,
  p_group_identifier text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id uuid;
  v_group_password text;
  v_is_member boolean;
  v_member_count int;
  v_member_limit int;
BEGIN
  -- 1. Resolve group by UUID or invite code
  SELECT id, password, member_limit INTO v_group_id, v_group_password, v_member_limit
  FROM groups
  WHERE id::text = p_group_identifier OR invite_code = p_group_identifier;

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Group not found');
  END IF;

  -- 2. Check if already a member
  SELECT EXISTS (
    SELECT 1 FROM group_members WHERE group_id = v_group_id AND user_id = p_user_id
  ) INTO v_is_member;

  IF v_is_member THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already a member', 'group_id', v_group_id);
  END IF;

  -- 3. Check member limit
  IF v_member_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_member_count FROM group_members WHERE group_id = v_group_id;
    IF v_member_count >= v_member_limit THEN
      RETURN jsonb_build_object('error', 'Group member limit reached');
    END IF;
  END IF;

  -- 4. If group has a password, require and check it
  IF v_group_password IS NOT NULL THEN
    IF p_password IS NULL OR p_password = '' THEN
      RETURN jsonb_build_object('error', 'Password required');
    END IF;
    IF NOT (v_group_password = crypt(p_password, v_group_password)) THEN
      RETURN jsonb_build_object('error', 'Invalid password');
    END IF;
  END IF;

  -- 5. Add the user to the group
  INSERT INTO group_members (group_id, user_id)
  VALUES (v_group_id, p_user_id);

  -- 6. Log the join in activity_logs
  INSERT INTO activity_logs (group_id, user_id, action_type, payload)
  VALUES (v_group_id, p_user_id, 'member_joined', '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'message', 'Joined group', 'group_id', v_group_id);
END;
$$; 