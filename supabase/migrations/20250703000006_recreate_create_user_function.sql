-- Create a function to securely create a new user, matching the cached signature
CREATE OR REPLACE FUNCTION public.create_user_securely(
  p_display_name text,
  p_password text,
  p_supabase_auth_id uuid,
  p_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Validate username
  IF NOT (p_username ~ '^[a-z0-9_]{3,30}$') THEN
    RAISE EXCEPTION 'Username must be 3-30 characters and contain only lowercase letters, numbers, and underscores';
  END IF;

  -- Validate display name
  IF length(p_display_name) < 1 OR length(p_display_name) > 50 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 50 characters';
  END IF;

  -- Validate password length
  IF length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters long';
  END IF;

  -- Check if username exists
  IF EXISTS (SELECT 1 FROM users WHERE username = p_username) THEN
    RAISE EXCEPTION 'Username already exists';
  END IF;

  -- Create user with hashed password
  INSERT INTO users (
    username,
    display_name,
    password_hash,
    supabase_auth_id
  )
  VALUES (
    p_username,
    p_display_name,
    crypt(p_password, gen_salt('bf')),
    p_supabase_auth_id
  )
  RETURNING id INTO v_user_id;

  -- Return user data
  RETURN (
    SELECT jsonb_build_object(
      'id', id,
      'username', username,
      'display_name', display_name,
      'supabase_auth_id', supabase_auth_id
    )
    FROM users
    WHERE id = v_user_id
  );
END;
$$; 