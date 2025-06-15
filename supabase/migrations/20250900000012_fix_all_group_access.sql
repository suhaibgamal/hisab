-- Drop existing policies and functions
DROP POLICY IF EXISTS "groups_view_policy" ON "public"."groups";
DROP FUNCTION IF EXISTS public.get_group_details(UUID, UUID);

-- Create new view policy
CREATE POLICY "groups_view_policy" ON "public"."groups"
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND (
    -- You're the manager
    manager_id = (
      SELECT id FROM public.users 
      WHERE supabase_auth_id = auth.uid()
      LIMIT 1
    )
    OR
    -- You're a member
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = id
      AND gm.user_id = (
        SELECT id FROM public.users 
        WHERE supabase_auth_id = auth.uid()
        LIMIT 1
      )
    )
    OR
    -- Public groups
    password IS NULL
    OR
    -- Private groups when accessed directly (for joining)
    id::text = current_setting('request.jwt.claims')::json->>'group_id'
  )
);

-- Create new group details function
CREATE OR REPLACE FUNCTION public.get_group_details(p_group_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name TEXT,
  password TEXT,
  manager_id UUID,
  invite_code TEXT,
  invite_code_visible BOOLEAN,
  created_at TIMESTAMPTZ,
  manager_username TEXT,
  manager_display_name TEXT
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get the current user's app ID if not provided
  IF p_user_id IS NULL THEN
    SELECT id INTO v_user_id 
    FROM public.users 
    WHERE supabase_auth_id = auth.uid()
    LIMIT 1;
  ELSE
    v_user_id := p_user_id;
  END IF;

  RETURN QUERY
  SELECT 
    g.id,
    g.name,
    g.password,
    g.manager_id,
    g.invite_code,
    g.invite_code_visible,
    g.created_at,
    u.username AS manager_username,
    u.display_name AS manager_display_name
  FROM public.groups g
  LEFT JOIN public.users u ON u.id = g.manager_id
  WHERE g.id = p_group_id
  AND (
    -- You're the manager
    g.manager_id = v_user_id
    OR
    -- You're a member
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = g.id
      AND gm.user_id = v_user_id
    )
    OR
    -- Public groups
    g.password IS NULL
    OR
    -- Private groups when accessed directly (for joining)
    g.id = p_group_id
  );
END;
$$; 