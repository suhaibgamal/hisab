-- Drop existing functions
DROP FUNCTION IF EXISTS public.get_current_user_app_id();
DROP FUNCTION IF EXISTS public.get_current_user_id();

-- Create updated functions
CREATE OR REPLACE FUNCTION public.get_current_user_app_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id 
  FROM public.users 
  WHERE supabase_auth_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.get_current_user_app_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_id() TO authenticated; 