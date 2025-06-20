-- Enable the pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add needs_password_reset column to users and groups
ALTER TABLE users ADD COLUMN IF NOT EXISTS needs_password_reset boolean DEFAULT false;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS needs_password_reset boolean DEFAULT false;

-- Create a function to verify passwords with named parameters
CREATE OR REPLACE FUNCTION public.verify_password(
  password text,
  hash text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
AS $$
  SELECT hash = crypt(password, hash);
$$;

-- Create a function to handle group joining with password verification
CREATE OR REPLACE FUNCTION public.join_group_securely(
  p_user_id uuid,
  p_group_id uuid,
  p_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_password text;
BEGIN
  -- Get the group's password
  SELECT password INTO v_group_password
  FROM groups
  WHERE id = p_group_id;

  -- Verify the password using crypt
  IF NOT (v_group_password = crypt(p_password, v_group_password)) THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;

  -- Add the user to the group
  INSERT INTO group_members (group_id, user_id)
  VALUES (p_group_id, p_user_id);
END;
$$;

-- Create a function to check if password reset is needed
CREATE OR REPLACE FUNCTION check_password_reset(entity_type text, entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF entity_type = 'user' THEN
    RETURN EXISTS (
      SELECT 1 FROM users 
      WHERE id = entity_id AND needs_password_reset = true
    );
  ELSIF entity_type = 'group' THEN
    RETURN EXISTS (
      SELECT 1 FROM groups 
      WHERE id = entity_id AND needs_password_reset = true
    );
  ELSE
    RETURN false;
  END IF;
END;
$$; 