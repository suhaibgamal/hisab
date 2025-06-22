-- Migration: Log member_joined in join_group_securely
-- Date: 2025-07-05

-- 1. Drop and recreate join_group_securely to add activity log
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

  -- 4. If group has a password, check it
  IF v_group_password IS NOT NULL THEN
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