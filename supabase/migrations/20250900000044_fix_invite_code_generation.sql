-- Drop existing function
DROP FUNCTION IF EXISTS public.create_group_with_manager(text, text, text, integer, boolean, boolean, privacy_level, privacy_level, uuid);

-- Recreate the function with fixed invite code generation
CREATE OR REPLACE FUNCTION public.create_group_with_manager(
  p_group_name text,
  p_description text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_member_limit integer DEFAULT 10,
  p_invite_code_visible boolean DEFAULT true,
  p_auto_approve_members boolean DEFAULT true,
  p_activity_log_privacy privacy_level DEFAULT 'managers',
  p_export_control privacy_level DEFAULT 'managers',
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_user_id uuid;
  v_invite_code text;
  v_password_hash text;
BEGIN
  -- Get current user's ID if not provided
  IF p_user_id IS NULL THEN
    SELECT public.get_current_user_app_id() INTO v_user_id;
  ELSE
    v_user_id := p_user_id;
  END IF;

  -- Validate inputs
  IF p_group_name IS NULL OR length(trim(p_group_name)) < 3 THEN
    RAISE EXCEPTION 'Group name must be at least 3 characters long';
  END IF;

  IF p_member_limit IS NOT NULL AND (p_member_limit < 2 OR p_member_limit > 100) THEN
    RAISE EXCEPTION 'Member limit must be between 2 and 100';
  END IF;

  -- Generate invite code using md5 instead of gen_random_bytes
  LOOP
    v_invite_code := upper(substring(md5(random()::text) for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.groups WHERE invite_code = v_invite_code);
  END LOOP;

  -- Hash password if provided
  IF p_password IS NOT NULL THEN
    v_password_hash := public.hash_password(p_password);
  END IF;

  -- Create group
  INSERT INTO public.groups (
    name,
    description,
    password,
    member_limit,
    invite_code,
    invite_code_visible,
    auto_approve_members,
    activity_log_privacy,
    export_control,
    manager_id
  )
  VALUES (
    p_group_name,
    p_description,
    v_password_hash,
    p_member_limit,
    v_invite_code,
    p_invite_code_visible,
    p_auto_approve_members,
    p_activity_log_privacy,
    p_export_control,
    v_user_id
  )
  RETURNING id INTO v_group_id;

  -- Add creator as manager
  INSERT INTO public.group_members (
    group_id,
    user_id,
    role
  )
  VALUES (
    v_group_id,
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
    v_group_id,
    v_user_id,
    'group_created',
    jsonb_build_object(
      'group_name', p_group_name,
      'is_private', v_password_hash IS NOT NULL
    )
  );

  RETURN v_group_id;
END;
$$; 