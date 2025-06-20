-- Step 1: Remove the password_hash column from the users table.
ALTER TABLE public.users
DROP COLUMN IF EXISTS password_hash;

-- Step 2: Recreate the function without any password handling.
-- This function is now only responsible for creating a user profile
-- and linking it to an existing Supabase Auth user.
CREATE OR REPLACE FUNCTION public.create_user_profile(
  p_username text,
  p_display_name text,
  p_supabase_auth_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_profile jsonb;
BEGIN
  -- Input validation (can be kept or simplified as needed)
  IF NOT (p_username ~ '^[a-z0-9_]{3,30}$') THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only lowercase letters, numbers, and underscores';
  END IF;

  IF length(p_display_name) < 1 OR length(p_display_name) > 50 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 50 characters';
  END IF;

  -- Insert the new user profile
  INSERT INTO public.users (username, display_name, supabase_auth_id)
  VALUES (p_username, p_display_name, p_supabase_auth_id)
  RETURNING (
    jsonb_build_object(
      'id', id,
      'username', username,
      'display_name', display_name,
      'supabase_auth_id', supabase_auth_id
    )
  ) INTO v_user_profile;

  RETURN v_user_profile;
END;
$$;

-- Step 3: Drop the old, insecure function.
DROP FUNCTION IF EXISTS public.create_user_securely(text, text, uuid, text); 