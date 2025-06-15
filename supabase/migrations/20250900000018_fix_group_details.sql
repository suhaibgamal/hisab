-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_group_details(UUID, UUID);

-- Recreate the function without the updated_at column
CREATE OR REPLACE FUNCTION public.get_group_details(
  p_group_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  password TEXT,
  manager_id UUID,
  invite_code TEXT,
  invite_code_visible BOOLEAN,
  member_limit INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the user is a member of the group
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = p_group_id
    AND user_id = p_user_id
  ) THEN
    -- If not a member, check if the group is public (no password)
    IF NOT EXISTS (
      SELECT 1
      FROM public.groups
      WHERE id = p_group_id
      AND password IS NULL
    ) THEN
      -- If private and not a member, return no rows
      RETURN;
    END IF;
  END IF;

  -- Return group details
  RETURN QUERY
  SELECT 
    g.id,
    g.name,
    g.password,
    g.manager_id,
    g.invite_code,
    g.invite_code_visible,
    g.member_limit,
    g.created_at
  FROM public.groups g
  WHERE g.id = p_group_id;
END;
$$; 