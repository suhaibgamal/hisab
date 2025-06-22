-- Migration: Add secure group member role management function
-- Date: 2025-07-05

-- 1. Drop old function if exists (for idempotency)
DROP FUNCTION IF EXISTS public.change_group_member_role(uuid, uuid, text);

-- 2. Create the new function
CREATE OR REPLACE FUNCTION public.change_group_member_role(
  p_group_id uuid,
  p_target_user_id uuid,
  p_new_role text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_creator_id uuid;
  v_target_role text;
  v_group_name text;
BEGIN
  -- Get the current user's ID (the actor)
  v_actor_id := public.get_current_user_app_id();

  -- Get the actor's role in the group
  SELECT role INTO v_actor_role FROM public.group_members WHERE group_id = p_group_id AND user_id = v_actor_id;
  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('error', 'You are not a member of this group');
  END IF;

  -- Get the group creator
  SELECT creator_id, name INTO v_creator_id, v_group_name FROM public.groups WHERE id = p_group_id;
  IF v_creator_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Group not found');
  END IF;

  -- Get the target user's current role
  SELECT role INTO v_target_role FROM public.group_members WHERE group_id = p_group_id AND user_id = p_target_user_id;
  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('error', 'Target user is not a member of this group');
  END IF;

  -- Prevent changing own role
  IF v_actor_id = p_target_user_id THEN
    RETURN jsonb_build_object('error', 'You cannot change your own role');
  END IF;

  -- Only allow valid roles
  IF p_new_role NOT IN ('manager', 'member') THEN
    RETURN jsonb_build_object('error', 'Invalid role');
  END IF;

  -- Permission logic
  IF v_actor_id = v_creator_id THEN
    -- Creator can promote/demote anyone except themselves
    NULL; -- allowed
  ELSIF v_actor_role = 'manager' THEN
    -- Managers can only promote members to manager (if allowed), never demote managers
    IF v_target_role = 'manager' THEN
      RETURN jsonb_build_object('error', 'Managers cannot change the role of other managers');
    END IF;
    IF p_new_role != 'manager' THEN
      RETURN jsonb_build_object('error', 'Managers can only promote members to manager');
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'You do not have permission to change roles');
  END IF;

  -- If no change needed
  IF v_target_role = p_new_role THEN
    RETURN jsonb_build_object('success', true, 'message', 'No change needed');
  END IF;

  -- Update the role
  UPDATE public.group_members SET role = p_new_role WHERE group_id = p_group_id AND user_id = p_target_user_id;

  -- Log the action
  INSERT INTO public.activity_logs (
    group_id, user_id, action_type, payload
  ) VALUES (
    p_group_id,
    v_actor_id,
    CASE WHEN p_new_role = 'manager' THEN 'promote_member' ELSE 'demote_manager' END,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'target_old_role', v_target_role,
      'target_new_role', p_new_role,
      'group_name', v_group_name
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'Role updated');
END;
$$;

-- Grant execution rights to authenticated users
GRANT EXECUTE ON FUNCTION public.change_group_member_role(uuid, uuid, text) TO authenticated;

-- 3. Drop old function if exists (for idempotency)
DROP FUNCTION IF EXISTS public.kick_group_member(uuid, uuid);

-- 4. Create the new function
CREATE OR REPLACE FUNCTION public.kick_group_member(
  p_group_id uuid,
  p_user_to_kick_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_kicker_id uuid;
  v_kicker_role text;
  v_kickee_role text;
  v_group_name text;
BEGIN
  -- Get the current user's ID
  SELECT public.get_current_user_app_id() INTO v_kicker_id;
  -- Get roles
  SELECT role INTO v_kicker_role FROM public.group_members WHERE group_id = p_group_id AND user_id = v_kicker_id;
  SELECT role INTO v_kickee_role FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;
  -- Get group name
  SELECT name INTO v_group_name FROM public.groups WHERE id = p_group_id;
  -- Check permissions
  IF v_kicker_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;
  IF v_kicker_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can kick members';
  END IF;
  IF v_kickee_role = 'manager' THEN
    RAISE EXCEPTION 'Cannot kick a manager';
  END IF;
  -- Delete the member
  DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_to_kick_id;
  -- Log the kick action
  INSERT INTO public.activity_logs (
    group_id, user_id, action_type, payload
  ) VALUES (
    p_group_id,
    v_kicker_id,
    'kick_member',
    jsonb_build_object(
      'target_user_id', p_user_to_kick_id,
      'target_role', v_kickee_role,
      'group_name', v_group_name
    )
  );
END;
$$; 