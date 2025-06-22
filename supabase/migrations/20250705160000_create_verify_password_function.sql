-- Create or replace the verify_password function for password checking
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