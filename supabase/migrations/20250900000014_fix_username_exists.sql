-- Recreate the username_exists function
CREATE OR REPLACE FUNCTION public.username_exists(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE username = p_username
  );
END;
$$; 