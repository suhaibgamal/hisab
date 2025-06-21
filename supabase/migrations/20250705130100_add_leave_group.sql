-- Migration: Add leave group function
-- Date: 2025-07-05

-- 1. Drop old function if exists (for idempotency)
DROP FUNCTION IF EXISTS public.leave_group(uuid);

-- 2. Create the new function
CREATE OR REPLACE FUNCTION public.leave_group(
  p_group_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_id uuid;
  v_creator_id uuid;
  v_group_name text;
  v_is_member boolean;
BEGIN
  -- Get the current user's ID (the actor)
  v_actor_id := public.get_current_user_app_id();

  -- Check if the user is a member
  SELECT EXISTS (
    SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = v_actor_id
  ) INTO v_is_member;
  IF NOT v_is_member THEN
    RETURN jsonb_build_object('error', 'You are not a member of this group');
  END IF;

  -- Get the group creator
  SELECT creator_id, name INTO v_creator_id, v_group_name FROM public.groups WHERE id = p_group_id;
  IF v_creator_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Group not found');
  END IF;

  -- Prevent the creator from leaving their own group
  IF v_actor_id = v_creator_id THEN
    RETURN jsonb_build_object('error', 'The group creator cannot leave their own group');
  END IF;

  -- Remove the user from the group
  DELETE FROM public.group_members WHERE group_id = p_group_id AND user_id = v_actor_id;

  -- Log the action
  INSERT INTO public.activity_logs (
    group_id, user_id, action_type, payload
  ) VALUES (
    p_group_id,
    v_actor_id,
    'member_left',
    jsonb_build_object(
      'group_name', v_group_name
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'You have left the group');
END;
$$;

-- Grant execution rights to authenticated users
GRANT EXECUTE ON FUNCTION public.leave_group(uuid) TO authenticated; 