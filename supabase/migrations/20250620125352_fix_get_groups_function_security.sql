-- Alter the security setting of the get_groups_for_user function
ALTER FUNCTION public.get_groups_for_user(p_user_id uuid)
SECURITY INVOKER;
