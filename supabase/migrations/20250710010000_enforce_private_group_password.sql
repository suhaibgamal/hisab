-- Migration: Enforce password required when making group private
-- Date: 2025-07-10

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
  v_current_privacy text;
  v_current_password text;
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

  -- 4. Fetch current privacy and password
  SELECT privacy_level, password INTO v_current_privacy, v_current_password FROM public.groups WHERE id = p_group_id;

  -- 5. Enforce password required when making group private
  IF v_current_privacy = 'public' AND p_privacy_level = 'private' AND (p_password IS NULL OR p_password = '') THEN
    RAISE EXCEPTION 'يجب تعيين كلمة مرور عند جعل المجموعة خاصة.';
  END IF;

  -- 6. Password logic
  IF p_privacy_level = 'public' THEN
    v_hashed_password := NULL;
  ELSIF p_password IS NOT NULL AND p_password != '' THEN
    v_hashed_password := crypt(p_password, gen_salt('bf'));
  ELSE
    SELECT password INTO v_hashed_password FROM public.groups WHERE id = p_group_id;
  END IF;

  -- 7. Update the group settings, casting to the correct ENUM types
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

  -- 8. Log the activity
  INSERT INTO public.activity_logs (group_id, user_id, action_type, payload)
  VALUES (p_group_id, v_internal_user_id, 'update_settings', '{}'::jsonb);

  -- 9. Return the updated group data
  RETURN v_updated_group;
END;
$$; 