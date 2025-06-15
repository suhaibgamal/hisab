-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_group_details(UUID, UUID);

-- Recreate the function with explicit column references
CREATE OR REPLACE FUNCTION public.get_group_details(
  p_group_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  group_id UUID,
  group_name TEXT,
  group_password TEXT,
  group_manager_id UUID,
  group_invite_code TEXT,
  group_invite_code_visible BOOLEAN,
  group_member_limit INTEGER,
  group_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the user is a member of the group
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
    AND gm.user_id = p_user_id
  ) THEN
    -- If not a member, check if the group is public (no password)
    IF NOT EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = p_group_id
      AND g.password IS NULL
    ) THEN
      -- If private and not a member, return no rows
      RETURN;
    END IF;
  END IF;

  -- Return group details with explicit column aliases
  RETURN QUERY
  SELECT 
    g.id AS group_id,
    g.name AS group_name,
    g.password AS group_password,
    g.manager_id AS group_manager_id,
    g.invite_code AS group_invite_code,
    g.invite_code_visible AS group_invite_code_visible,
    g.member_limit AS group_member_limit,
    g.created_at AS group_created_at
  FROM public.groups g
  WHERE g.id = p_group_id;
END;
$$; 